import type { Static, TSchema } from 'typebox'
import type { DatabaseClient } from '../db'
import type { AuthContext } from '../iam/auth-context.ts'
import type { IAMManager } from '../iam/context.ts'
import type { KVStore } from '../kv/types.ts'
import type { Logger } from '../logger/index.ts'
import type { MailerAdapter } from '../mailer/types.ts'
import type { StorageAdapter } from '../storage/types.ts'
import type { ActionRegistry } from './registry.ts'
import type { WrappedGuards } from './guards/execution.ts'

// ── Trigger Types ────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Uploaded file from multipart/form-data request.
 * Available in action input when Content-Type is multipart/form-data.
 */
export interface UploadedFile {
	/** Original filename from the upload */
	filename: string
	/** MIME type of the file (e.g., 'image/png', 'application/pdf') */
	contentType: string
	/** File size in bytes */
	size: number
	/** File data as Buffer */
	data: Buffer
}

export interface ApiTriggerConfig {
	readonly type: 'api'
	readonly method: HttpMethod
	readonly path: string
	readonly map?: (req: Request) => unknown | Promise<unknown>
}

export interface EventTriggerConfig {
	readonly type: 'event'
	readonly event: string
	readonly map?: (payload: unknown) => unknown
}

export interface CronTriggerConfig {
	readonly type: 'cron'
	readonly schedule: string
	readonly input?: () => unknown
}

export interface ToolTriggerConfig {
	readonly type: 'tool'
	readonly name: string
	readonly description: string
}

export interface WebhookTriggerConfig {
	readonly type: 'webhook'
	readonly path: string
	readonly verify?: (req: Request) => boolean | Promise<boolean>
	readonly map?: (body: unknown) => unknown
}

export type TriggerConfig =
	| ApiTriggerConfig
	| EventTriggerConfig
	| CronTriggerConfig
	| ToolTriggerConfig
	| WebhookTriggerConfig

// ── Retry Configuration ─────────────────────────────────

export interface RetryConfig {
	/** Total attempts including the first (default: 1 = no retries). Set to 3 for 1 initial + 2 retries. */
	readonly maxAttempts?: number
	/** Backoff strategy: 'exponential' (default) or 'fixed' */
	readonly backoff?: 'fixed' | 'exponential'
	/** Base delay in ms before first retry (default: 1000) */
	readonly backoffMs?: number
	/** Max delay cap in ms for exponential (default: 30000) */
	readonly maxBackoffMs?: number
	/** Custom predicate — return true to retry, false to stop. Runs after built-in classification. */
	readonly retryIf?: (error: Error) => boolean
}

// ── Guard Types ──────────────────────────────────────────

export type GuardFn = (ctx: ActionContext) => void | Promise<void>

// ── HTTP Metadata Types ──────────────────────────────────

/**
 * HTTP-specific transport metadata for API and Webhook triggers.
 * Use the _meta.http field in your return value.
 *
 * @example
 * return {
 *   userId: user.id,
 *   _meta: {
 *     http: {
 *       status: 201,
 *       headers: { Location: '/users/123' }
 *     }
 *   }
 * }
 */
export interface HttpTransportMeta {
	/** HTTP status code (default: 200) */
	status?: number
	/** Custom response headers */
	headers?: Record<string, string>
	/** Cookies to set */
	cookies?: Array<{
		name: string
		value: string
		httpOnly?: boolean
		secure?: boolean
		sameSite?: 'strict' | 'lax' | 'none'
		path?: string
		domain?: string
		maxAge?: number
		expires?: Date
	}>
}

/**
 * @deprecated Use HttpTransportMeta and _meta.http instead. Support for _http will be removed in v2.0.0
 */
export type HttpMetadata = HttpTransportMeta

/**
 * MCP tool-specific transport metadata.
 * Controls output formatting for Model Context Protocol tools.
 */
export interface McpTransportMeta {
	/** Format hint: 'text', 'json', or 'structured' */
	format?: 'text' | 'json' | 'structured'
	/** Include TypeBox schema in response */
	includeSchema?: boolean
	/** Streaming hint for large responses */
	isStreaming?: boolean
}

/**
 * Event-specific transport metadata.
 * Controls event emission behavior.
 */
export interface EventTransportMeta {
	/** Broadcast to all listeners vs. single listener */
	broadcast?: boolean
	/** Priority for event queue (higher = sooner) */
	priority?: number
	/** Delay before emitting (milliseconds) */
	delay?: number
}

/**
 * Cron-specific transport metadata.
 * Allows dynamic control of scheduled jobs.
 */
export interface CronTransportMeta {
	/** Dynamically update cron schedule for next run */
	reschedule?: string
	/** Skip next scheduled run */
	skipNext?: boolean
	/** One-time execution, then disable */
	runOnce?: boolean
}

/**
 * Unified transport metadata container.
 * Only the relevant section is used based on trigger type.
 *
 * @example
 * // HTTP trigger - status and headers
 * return {
 *   userId: '123',
 *   _meta: {
 *     http: { status: 201, headers: { Location: '/users/123' } }
 *   }
 * }
 *
 * @example
 * // MCP tool - structured format
 * return {
 *   result: data,
 *   _meta: {
 *     mcp: { format: 'structured', includeSchema: true }
 *   }
 * }
 *
 * @example
 * // Multi-trigger action
 * return {
 *   data: result,
 *   _meta: {
 *     http: { status: 201 },        // Used when called via API
 *     mcp: { format: 'json' }        // Used when called as MCP tool
 *   }
 * }
 */
export interface TransportMetadata {
	/** HTTP metadata for API and Webhook triggers */
	http?: HttpTransportMeta
	/** MCP tool metadata */
	mcp?: McpTransportMeta
	/** Event bus metadata */
	event?: EventTransportMeta
	/** Cron scheduler metadata */
	cron?: CronTransportMeta
}

/**
 * Action output with optional transport metadata.
 * The _meta field is stripped before validation and applied by the runtime.
 *
 * @example
 * return {
 *   userId: '123',
 *   _meta: {
 *     http: { status: 201, headers: { Location: '/users/123' } }
 *   }
 * }
 */
export type ActionOutput<T> = T & {
	/** Unified transport metadata for all trigger types */
	_meta?: TransportMetadata
}

// ── Action Context ───────────────────────────────────────

export interface ActionContext {
	/** Typed database client */
	db: DatabaseClient

	/** File storage (S3 or local filesystem) */
	storage: StorageAdapter

	/** Email mailer (SMTP, Resend, SendGrid, etc.) */
	mailer: MailerAdapter

	/** Key-value store (Postgres-backed or Redis) */
	kv: KVStore

	/** Redis client (optional, for distributed rate limiting and caching) */
	redis?: import('bun').RedisClient

	/** Child logger scoped to this action + traceId */
	logger: Logger

	/** Unique trace ID for this invocation */
	traceId: string

	/** Retry state for the current attempt */
	retry: {
		/** Current attempt number (1-indexed) */
		attempt: number
		/** Total max attempts configured */
		maxAttempts: number
	}

	/** Emit an event on the internal event bus */
	event: {
		emit: (name: string, payload?: unknown) => void
	}

	/**
	 * Auth context — primary interface for authentication and authorization.
	 * Includes session management (login/signup/logout), lazy user/team loading,
	 * and permission checks (can/canAll/hasRole).
	 *
	 * @example
	 * const user = await ctx.auth.login(email, password) // auto-sets cookie
	 * const { allowed } = await ctx.auth.can('article:publish')
	 * ctx.auth.logout()
	 */
	auth: AuthContext

	/**
	 * IAM Manager — admin interface for managing roles, organizations, and subscriptions.
	 * Only available if database is configured.
	 *
	 * @example
	 * await ctx.iam.roles.createRole({ key: 'editor', name: 'Editor', weight: 50 })
	 * await ctx.iam.orgs.create(userId, 'Acme Corp', 'acme')
	 */
	iam: IAMManager

	/**
	 * Platform Manager — comprehensive authentication and authorization platform.
	 * Provides access to auth, email, organizations, RBAC, billing, entitlements, and webhooks.
	 * Only available if database is configured.
	 *
	 * @example
	 * // Password authentication
	 * const { userId, session } = await ctx.platform.auth.password.signUpPassword({ email, password })
	 *
	 * // Organization management
	 * const org = await ctx.platform.orgs.organizations.create({ name: 'Acme Corp', ownerId })
	 *
	 * // Subscription management
	 * await ctx.platform.billing.subscriptions.create({ userId, planKey: 'pro' })
	 *
	 * // Feature entitlements
	 * const hasFeature = await ctx.platform.entitlements.resolver.hasFeature({ subjectType: 'user', subjectId }, 'api:advanced')
	 */
	platform: import('../platform/context.ts').PlatformManager

	/**
	 * Module context (if action is part of a module)
	 */
	module?: {
		name: string
		config?: unknown
	}

	/**
	 * HTTP Response manipulation (only for API/Webhook triggers)
	 */
	response?: {
		headers: Headers
		/**
		 * Set a cookie
		 * @param name Cookie name
		 * @param value Cookie value
		 * @param opts Cookie options
		 */
		setCookie: (name: string, value: string, opts?: any) => void
	}

	/** Raw request (only for API/webhook triggers) */
	request?: Request
	headers?: Record<string, string>

	/** Action registry for introspection (used by studio actions) */
	registry?: ActionRegistry

	/** Schedule jobs for background execution (number = delay in seconds, Date = specific time) */
	schedule: (
		time: number | Date,
		name: string,
		data: unknown,
		opts?: { priority?: number; maxRetries?: number },
	) => Promise<string>

	/** Queue management for background jobs */
	queue: {
		/** Add/push a job to the queue */
		add: (
			name: string,
			data: unknown,
			opts?: { priority?: number; maxRetries?: number },
		) => Promise<string>
		push: (
			name: string,
			data: unknown,
			opts?: { priority?: number; maxRetries?: number },
		) => Promise<string>
		/** Get job by ID */
		get: (jobId: string) => Promise<unknown>
		/** Get all jobs with optional filters */
		getAll: (opts?: {
			status?: string
			name?: string
			limit?: number
		}) => Promise<unknown[]>
		/** Update a job's data or priority */
		update: (
			jobId: string,
			updates: { data?: unknown; priority?: number },
		) => Promise<boolean>
		/** Delete/remove a pending job */
		delete: (jobId: string) => Promise<boolean>
		remove: (jobId: string) => Promise<boolean>
	}

	/**
	 * Helper to attach transport metadata to action outputs.
	 * Makes it easier to return data with HTTP status codes, headers, cookies,
	 * or other transport-specific metadata.
	 *
	 * @example
	 * // HTTP: Custom status and headers
	 * return ctx.withMeta(
	 *   { id: user.id, email: user.email },
	 *   { http: { status: 201, headers: { Location: `/users/${user.id}` } } }
	 * )
	 *
	 * @example
	 * // MCP: Structured format
	 * return ctx.withMeta(
	 *   { analysis: result },
	 *   { mcp: { format: 'structured', includeSchema: true } }
	 * )
	 */
	/**
	 * Access a realtime channel for publishing messages to WebSocket subscribers.
	 * Works from any action context (API, cron, event, etc.)
	 *
	 * @example
	 * ctx.channel('chat:general').publish('message', { text: 'Hello!' })
	 * const count = ctx.channel('chat:general').subscriberCount()
	 */
	channel: (name: string) => import('../realtime/types.ts').ChannelAPI

	withMeta: <T extends object>(
		data: T,
		metadata?: TransportMetadata,
	) => ActionOutput<T>

	/**
	 * Call another action from within this action (action composition).
	 * Enables building complex workflows by chaining actions together.
	 * Circular dependencies are automatically detected and prevented.
	 *
	 * @param actionName - Name of the action to call (supports module namespacing: "module.action")
	 * @param input - Input data for the action
	 * @returns The action's output data
	 * @throws {CircularDependencyError} If a circular action dependency is detected
	 * @throws {Error} If the action is not found in the registry
	 *
	 * @example
	 * // Call a helper action
	 * const result = await ctx.action('calculateSum', { a: 10, b: 20 })
	 *
	 * @example
	 * // Call a module action
	 * const user = await ctx.action('auth.getUser', { userId: '123' })
	 */
	action: <TOutput = unknown>(
		actionName: string,
		input: unknown,
	) => Promise<TOutput>
}

// ── Action Config ────────────────────────────────────────

export interface ActionConfig<
	TInput extends TSchema = TSchema,
	TOutput extends TSchema = TSchema,
> {
	readonly name: string
	readonly description?: string
	readonly input: TInput
	readonly output: TOutput
	readonly triggers?: TriggerConfig[]
	readonly guards?: GuardFn[] | WrappedGuards
	readonly retry?: RetryConfig
}

export type ActionHandler<
	TInput extends TSchema = TSchema,
	TOutput extends TSchema = TSchema,
> = (
	input: Static<TInput>,
	ctx: ActionContext,
) => Promise<ActionOutput<Static<TOutput>>>

export interface ActionDefinition<
	TInput extends TSchema = TSchema,
	TOutput extends TSchema = TSchema,
> {
	readonly config: ActionConfig<TInput, TOutput>
	readonly handler: ActionHandler<TInput, TOutput>
}

// ── Module Config ────────────────────────────────────────

export interface ModuleConfig {
	readonly name: string
	readonly description?: string
	readonly apiPrefix?: string
	readonly guards?: GuardFn[] | WrappedGuards
	readonly actions: ActionDefinition[]
}

export interface ModuleDefinition {
	readonly config: ModuleConfig
}
