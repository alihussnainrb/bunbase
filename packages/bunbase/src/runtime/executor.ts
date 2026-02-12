import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ActionContext } from '../core/types.ts'
import type { DatabaseClient } from '../db/client.ts'
import type { KVStore } from '../kv/types.ts'
import type { Logger } from '../logger/index.ts'
import type { RunEntry } from '../persistence/types.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import type { StorageAdapter } from '../storage/types.ts'
import { isRetryable } from '../utils/errors.ts'
import { eventBus } from './event-bus.ts'

import type { Queue } from './queue.ts'
import type { Scheduler } from './scheduler.ts'

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
		kv?: KVStore
		queue?: Queue
		scheduler?: Scheduler
		registry?: ActionRegistry
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
}> {
	const traceId = generateTraceId()
	const startedAt = Date.now()

	// Create child logger for this action invocation
	const actionLogger = opts.logger.child({
		action: action.definition.config.name,
		module: action.moduleName,
		traceId,
	})

	// Build context
	const queue = opts.queue
	const scheduler = opts.scheduler
	const ctx: ActionContext = {
		db: (opts.db ?? null) as any,
		storage: (opts.storage ?? null) as any,
		kv: (opts.kv ?? null) as any,
		logger: actionLogger,
		traceId,
		event: {
			emit: (name: string, payload?: unknown) => {
				eventBus.emit(name, payload)
			},
		},
		auth: opts.auth ?? {},
		module: action.moduleName ? { name: action.moduleName } : undefined,
		retry: { attempt: 1, maxAttempts: 1 },
		response: opts.response,
		request: opts.request,
		registry: opts.registry,
		schedule: async (time, name, data, scheduleOpts) => {
			if (!queue) {
				throw new Error('Queue not configured. Call server.setQueue() first.')
			}
			// Schedule via queue with delay
			const delay = typeof time === 'number' ? time : 0
			return queue.push(name, data, {
				...scheduleOpts,
				priority: scheduleOpts?.priority,
			})
		},
		queue: {
			add: async (name, data, opts) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.add(name, data, opts)
			},
			push: async (name, data, opts) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.push(name, data, opts)
			},
			get: async (jobId) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.get(jobId)
			},
			getAll: async (opts) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.getAll({
					status: opts?.status as any,
					name: opts?.name,
					limit: opts?.limit,
				})
			},
			update: async (jobId, updates) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.update(jobId, updates)
			},
			delete: async (jobId) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.delete(jobId)
			},
			remove: async (jobId) => {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}
				return queue.remove(jobId)
			},
		},
	}

	try {
		// Run guards (once, not retried)
		for (const guard of action.guards) {
			await guard(ctx)
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
					output: safeStringify(result),
					error: null,
					duration_ms: Date.now() - startedAt,
					started_at: startedAt,
					attempt: maxAttempts > 1 ? attempt : null,
					max_attempts: maxAttempts > 1 ? maxAttempts : null,
				}
				opts.writeBuffer.pushRun(runEntry)

				return { success: true, data: result }
			} catch (handlerErr) {
				lastError =
					handlerErr instanceof Error
						? handlerErr
						: new Error(String(handlerErr))
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
						duration_ms: Date.now() - startedAt,
						started_at: startedAt,
						attempt: maxAttempts > 1 ? attempt : null,
						max_attempts: maxAttempts > 1 ? maxAttempts : null,
					}
					opts.writeBuffer.pushRun(runEntry)

					return {
						success: false,
						error: errorMessage,
						errorObject: lastError,
					}
				}
			}
		}

		// All retries exhausted (safety net)
		const errorMessage = lastError?.message ?? 'All retry attempts exhausted'
		actionLogger.error(
			`Action failed after ${maxAttempts} attempts: ${errorMessage}`,
		)

		return {
			success: false,
			error: errorMessage,
			errorObject: lastError ?? new Error(errorMessage),
		}
	} catch (err) {
		// Guard failures land here (outside retry loop)
		const errorMessage = err instanceof Error ? err.message : String(err)
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
			duration_ms: Date.now() - startedAt,
			started_at: startedAt,
			attempt: null,
			max_attempts: null,
		}
		opts.writeBuffer.pushRun(runEntry)

		return {
			success: false,
			error: errorMessage,
			errorObject: err instanceof Error ? err : new Error(String(err)),
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
