import type { Static, TSchema } from 'typebox'
import type {  DatabaseClient } from '../db'
import type { KVStore } from '../kv/types.ts'
import type { Logger } from '../logger/index.ts'
import type { StorageAdapter } from '../storage/types.ts'
import type { ActionRegistry } from './registry.ts'

// ── Trigger Types ────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

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

// ── Action Context ───────────────────────────────────────

export interface ActionContext {
	/** Typed database client */
	db: DatabaseClient<import("../db").Database>

	/** File storage (S3 or local filesystem) */
	storage: StorageAdapter

	/** Key-value store (Postgres-backed) */
	kv: KVStore

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

	/** Auth context (populated by auth guards) */
	auth: {
		userId?: string
		orgId?: string
		role?: string
		permissions?: string[]
	}

	/**
	 * Org context (populated by inOrg guard)
	 */
	org?: {
		id: string
		slug: string
		name: string
		plan: string
		features: string[]
		memberCount: number
	}

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

	/** Schedule jobs for background execution */
	schedule: (
		time: number | Date | string,
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
	readonly guards?: GuardFn[]
	readonly retry?: RetryConfig
}

export type ActionHandler<
	TInput extends TSchema = TSchema,
	TOutput extends TSchema = TSchema,
> = (input: Static<TInput>, ctx: ActionContext) => Promise<Static<TOutput>>

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
	readonly guards?: GuardFn[]
	readonly actions: ActionDefinition[]
}

export interface ModuleDefinition {
	readonly config: ModuleConfig
}
