import type { SessionManager } from '../auth/session.ts'
import type { BunbaseConfig } from '../config/types.ts'
import {
	isWrappedGuards,
	type WrappedGuards,
} from '../core/guards/execution.ts'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ActionContext, TransportMetadata } from '../core/types.ts'
import type { DatabaseClient } from '../db/client.ts'
import type { SessionAction } from '../iam/types.ts'
import type { KVStore } from '../kv/types.ts'
import type { Logger } from '../logger/index.ts'
import type { RunEntry } from '../persistence/types.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import type { ChannelManager } from '../realtime/channel-manager.ts'
import type { StorageAdapter } from '../storage/types.ts'
import type { MetricsCollector } from '../observability/metrics.ts'
import { ActionValidationError } from '../core/action.ts'
import { GuardError } from '../core/guards/types.ts'
import {
	BunbaseError,
	CircularDependencyError,
	InternalError,
	isRetryable,
	type ErrorContext,
} from '../utils/errors.ts'
import { createLazyContext } from './context.ts'
import type { Queue } from './queue.ts'
import type { Scheduler } from './scheduler.ts'

/**
 * Wraps an error with execution context for better debugging.
 * - GuardError: returned as-is (preserves status code)
 * - BunbaseError: merges context
 * - Generic Error: converts to InternalError with context
 */
function wrapError(
	error: unknown,
	context: ErrorContext,
): BunbaseError | Error {
	// Guard errors should be returned as-is, not wrapped
	// They already have the correct status code (401/403/429)
	if (error instanceof GuardError) {
		return error
	}
	if (error instanceof BunbaseError) {
		return error.withContext(context)
	}
	if (error instanceof Error) {
		return new InternalError(error.message, context)
	}
	return new InternalError(String(error), context)
}

/**
 * Extracts structured validation errors from ActionValidationError.
 * Returns JSON string of validation errors, or null if not a validation error.
 */
function extractValidationError(error: unknown): string | null {
	if (error instanceof ActionValidationError) {
		try {
			return JSON.stringify(error.validationErrors)
		} catch {
			return null
		}
	}
	return null
}

/**
 * Record action execution metrics
 */
function recordActionMetrics(
	metrics: MetricsCollector | undefined,
	actionName: string,
	status: 'success' | 'error',
	durationMs: number,
	error?: Error,
): void {
	if (!metrics) return

	// Increment action execution counter
	metrics.incrementCounter(
		'bunbase_action_executions_total',
		'Total action executions',
		{
			labels: { action: actionName, status },
		},
	)

	// Record action duration
	metrics.observeHistogram(
		'bunbase_action_duration_ms',
		'Action execution duration in milliseconds',
		durationMs,
		{ labels: { action: actionName } },
	)

	// Increment error counter if failed
	if (status === 'error' && error) {
		const errorType = error.constructor.name
		metrics.incrementCounter('bunbase_errors_total', 'Total errors by type', {
			labels: { type: errorType, action: actionName },
		})
	}
}

/**
 * Executes a registered action through the full pipeline:
 *   1. Build action context
 *   2. Run guards (module guards first, then action guards)
 *   3. Run handler with validated input
 *   4. Record run entry to WriteBuffer
 */
export async function executeAction(
	action: RegisteredAction,
	input: unknown,
	opts: {
		triggerType: string
		request?: Request
		logger: Logger
		writeBuffer: WriteBuffer
		db?: DatabaseClient
		storage?: StorageAdapter
		mailer?: import('../mailer/types.ts').MailerAdapter
		kv?: KVStore
		redis?: import('bun').RedisClient
		channelManager?: ChannelManager | null
		queue?: Queue
		scheduler?: Scheduler
		registry?: ActionRegistry
		sessionManager?: SessionManager
		config?: BunbaseConfig
		metrics?: MetricsCollector
		auth?: {
			userId?: string
			role?: string
			permissions?: string[]
			[key: string]: unknown
		}
		response?: {
			headers: Headers
			setCookie: (name: string, value: string, opts?: any) => void
		}
	},
): Promise<{
	success: boolean
	data?: unknown
	error?: string
	errorObject?: Error
	transportMeta?: TransportMetadata
	sessionActions?: SessionAction[]
}> {
	const traceId = generateTraceId()
	const startedAt = Date.now()

	// Create error context for this execution
	const errorContext: ErrorContext = {
		traceId,
		actionName: action.definition.config.name,
		moduleName: action.moduleName ?? undefined,
		userId: opts.auth?.userId,
	}

	// Create child logger for this action invocation
	const actionLogger = opts.logger.child({
		action: action.definition.config.name,
		module: action.moduleName,
		traceId,
	})

	// Loop detection: Check for circular action dependencies
	const callStack = (opts.auth?._callStack as string[] | undefined) || []
	const actionName = action.registryKey
	const maxDepth = 50 // Prevent infinite loops while allowing deep legitimate chains

	if (callStack.includes(actionName)) {
		throw new CircularDependencyError(
			actionName,
			callStack,
			undefined,
			errorContext,
		)
	}

	if (callStack.length >= maxDepth) {
		throw new InternalError(
			`Maximum action call depth (${maxDepth}) exceeded. Call stack: ${callStack.join(' → ')}`,
			errorContext,
		)
	}

	// Add current action to call stack for nested action calls
	const newCallStack = [...callStack, actionName]

	// Build context with lazy service initialization
	const ctx: ActionContext = createLazyContext({
		logger: actionLogger,
		traceId,
		triggerType: opts.triggerType,
		request: opts.request,
		db: opts.db,
		storage: opts.storage,
		mailer: opts.mailer,
		kv: opts.kv,
		redis: opts.redis,
		channelManager: opts.channelManager,
		queue: opts.queue,
		scheduler: opts.scheduler,
		registry: opts.registry,
		sessionManager: opts.sessionManager,
		writeBuffer: opts.writeBuffer,
		auth: { ...opts.auth, _callStack: newCallStack },
		response: opts.response,
		moduleName: action.moduleName ?? undefined,
	})

	try {
		// Run guards (once, not retried)
		const guardArray = action.guards
		if (guardArray.length > 0) {
			// Check if guards are wrapped with execution mode
			const isWrapped = isWrappedGuards(guardArray)
			const mode = isWrapped
				? (guardArray as WrappedGuards)._mode
				: opts.config?.guards?.defaultMode ?? 'sequential'
			const guards = isWrapped
				? (guardArray as WrappedGuards).guards
				: (guardArray as import('../core/types.ts').GuardFn[])

			if (mode === 'parallel') {
				await Promise.all(guards.map((guard) => guard(ctx)))
			} else {
				for (const guard of guards) {
					await guard(ctx)
				}
			}
		}

		// Resolve retry configuration
		const retryConfig = action.definition.config.retry
		const maxAttempts = retryConfig?.maxAttempts ?? 1
		const backoffStrategy = retryConfig?.backoff ?? 'exponential'
		const backoffMs = retryConfig?.backoffMs ?? 1000
		const maxBackoffMs = retryConfig?.maxBackoffMs ?? 30000
		const retryIf = retryConfig?.retryIf

		// Update context with retry info
		ctx.retry = { attempt: 1, maxAttempts }

		let lastError: Error | null = null

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			ctx.retry = { attempt, maxAttempts }

			try {
				// Run handler (validation is baked into the wrapped handler)
				const result = await action.definition.handler(input as never, ctx)

				// Extract transport metadata with backward compatibility
				let transportMeta: TransportMetadata | undefined

				if (result && typeof result === 'object') {
					// Check for new _meta field
					if ('_meta' in result) {
						transportMeta = (result as any)._meta
					}
					// Backward compatibility: check for old _http field
					else if ('_http' in result) {
						console.warn(
							'[DEPRECATED] Use _meta.http instead of _http. Support for _http will be removed in v1.0.0',
						)
						transportMeta = { http: (result as any)._http }
					}
				}

				// Strip metadata from result before saving to database
				let cleanResult = result
				if (result && typeof result === 'object') {
					if ('_meta' in result) {
						const { _meta, ...rest } = result as any
						cleanResult = rest
					} else if ('_http' in result) {
						const { _http, ...rest } = result as any
						cleanResult = rest
					}
				}

				// Record successful run
				const runEntry: RunEntry = {
					id:
						maxAttempts > 1 && attempt > 1 ? `${traceId}-a${attempt}` : traceId,
					action_name: action.definition.config.name,
					module_name: action.moduleName,
					trace_id: traceId,
					trigger_type: opts.triggerType,
					status: 'success',
					input: safeStringify(input),
					output: safeStringify(cleanResult),
					error: null,
					error_stack: null,
					duration_ms: Date.now() - startedAt,
					started_at: startedAt,
					attempt: maxAttempts > 1 ? attempt : null,
					max_attempts: maxAttempts > 1 ? maxAttempts : null,
				}
				opts.writeBuffer.pushRun(runEntry)

				// Record action metrics
				const durationMs = Date.now() - startedAt
				recordActionMetrics(
					opts.metrics,
					action.definition.config.name,
					'success',
					durationMs,
				)

				// Extract session actions from auth context
				const sessionActions = (ctx.auth as any)._sessionActions as
					| SessionAction[]
					| undefined
				const pendingSessionActions =
					sessionActions && sessionActions.length > 0
						? sessionActions
						: undefined

				return {
					success: true,
					data: cleanResult,
					transportMeta,
					sessionActions: pendingSessionActions,
				}
			} catch (handlerErr) {
				// Wrap error with context
				const wrappedError = wrapError(handlerErr, errorContext)
				lastError =
					wrappedError instanceof Error ? wrappedError : new Error(String(wrappedError))
				const errorMessage = lastError.message

				// Determine if we should retry
				const builtinRetryable = isRetryable(handlerErr)
				const customRetryable = retryIf ? retryIf(lastError) : true
				const shouldRetry =
					builtinRetryable && customRetryable && attempt < maxAttempts

				if (shouldRetry) {
					// Log retry attempt
					actionLogger.warn(
						`Action failed (attempt ${attempt}/${maxAttempts}), retrying: ${errorMessage}`,
					)

					// Record intermediate failed run entry
					const runEntry: RunEntry = {
						id: `${traceId}-a${attempt}`,
						action_name: action.definition.config.name,
						module_name: action.moduleName,
						trace_id: traceId,
						trigger_type: opts.triggerType,
						status: 'error',
						input: safeStringify(input),
						output: null,
						error: errorMessage,
						error_stack: lastError.stack || null,
						validation_error: extractValidationError(handlerErr),
						duration_ms: Date.now() - startedAt,
						started_at: startedAt,
						attempt,
						max_attempts: maxAttempts,
					}
					opts.writeBuffer.pushRun(runEntry)

					// Calculate backoff delay
					const delay =
						backoffStrategy === 'exponential'
							? Math.min(backoffMs * 2 ** (attempt - 1), maxBackoffMs)
							: backoffMs

					await sleep(delay)
				} else {
					// Not retrying — record final failure and exit
					actionLogger.error(`Action failed: ${errorMessage}`)

					const runEntry: RunEntry = {
						id:
							maxAttempts > 1 && attempt > 1
								? `${traceId}-a${attempt}`
								: traceId,
						action_name: action.definition.config.name,
						module_name: action.moduleName,
						trace_id: traceId,
						trigger_type: opts.triggerType,
						status: 'error',
						input: safeStringify(input),
						output: null,
						error: errorMessage,
						error_stack: lastError.stack || null,
						validation_error: extractValidationError(handlerErr),
						duration_ms: Date.now() - startedAt,
						started_at: startedAt,
						attempt: maxAttempts > 1 ? attempt : null,
						max_attempts: maxAttempts > 1 ? maxAttempts : null,
					}
					opts.writeBuffer.pushRun(runEntry)

					// Record action metrics
					const durationMs = Date.now() - startedAt
					recordActionMetrics(
						opts.metrics,
						action.definition.config.name,
						'error',
						durationMs,
						lastError,
					)

					return {
						success: false,
						error: errorMessage,
						errorObject: lastError,
					}
				}
			}
		}

		// All retries exhausted (safety net)
		const finalError = lastError
			? wrapError(lastError, errorContext)
			: new InternalError('All retry attempts exhausted', errorContext)
		const errorMessage = finalError instanceof Error ? finalError.message : 'All retry attempts exhausted'
		actionLogger.error(
			`Action failed after ${maxAttempts} attempts: ${errorMessage}`,
		)

		// Record action metrics
		const durationMs = Date.now() - startedAt
		recordActionMetrics(
			opts.metrics,
			action.definition.config.name,
			'error',
			durationMs,
			finalError instanceof Error ? finalError : undefined,
		)

		return {
			success: false,
			error: errorMessage,
			errorObject: finalError,
		}
	} catch (err) {
		// Guard failures land here (outside retry loop)
		const wrappedError = wrapError(err, errorContext)
		const errorMessage = wrappedError instanceof Error ? wrappedError.message : String(err)
		const errorStack = wrappedError instanceof Error ? wrappedError.stack || null : null
		actionLogger.error(`Action failed: ${errorMessage}`)

		const runEntry: RunEntry = {
			id: traceId,
			action_name: action.definition.config.name,
			module_name: action.moduleName,
			trace_id: traceId,
			trigger_type: opts.triggerType,
			status: 'error',
			input: safeStringify(input),
			output: null,
			error: errorMessage,
			error_stack: errorStack,
			validation_error: extractValidationError(err),
			duration_ms: Date.now() - startedAt,
			started_at: startedAt,
			attempt: null,
			max_attempts: null,
		}
		opts.writeBuffer.pushRun(runEntry)

		// Record action metrics
		const durationMs = Date.now() - startedAt
		recordActionMetrics(
			opts.metrics,
			action.definition.config.name,
			'error',
			durationMs,
			wrappedError instanceof Error ? wrappedError : undefined,
		)

		return {
			success: false,
			error: errorMessage,
			errorObject: wrappedError,
		}
	}
}

function generateTraceId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function safeStringify(value: unknown): string | null {
	if (value === undefined || value === null) return null
	try {
		return JSON.stringify(value)
	} catch {
		return null
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
