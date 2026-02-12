import type { ActionRegistry } from '../core/registry.ts'
import type { ActionContext } from '../core/types.ts'
import type { DatabaseClient } from '../db/client.ts'
import type { IAMContext } from '../iam/context.ts'
import { createIAMContext } from '../iam/context.ts'
import type { KVStore } from '../kv/types.ts'
import type { Logger } from '../logger/index.ts'
import type { StorageAdapter } from '../storage/types.ts'
import { eventBus } from './event-bus.ts'
import type { Queue } from './queue.ts'
import type { Scheduler } from './scheduler.ts'

export interface CreateLazyContextOptions {
	logger: Logger
	traceId: string
	triggerType: string
	request?: Request
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
	moduleName?: string
}

/**
 * Creates an ActionContext with lazy initialization for expensive services.
 * Services like db, storage, kv, and queue are only initialized when accessed.
 * This prevents unnecessary overhead for simple handlers that don't need these services.
 */
export function createLazyContext(
	opts: CreateLazyContextOptions,
): ActionContext {
	// Cached lazy services (undefined = not yet accessed)
	let _db: DatabaseClient | null | undefined
	let _storage: StorageAdapter | null | undefined
	let _kv: KVStore | null | undefined
	let _queue: ActionContext['queue'] | undefined
	let _iam: IAMContext | undefined

	const queue = opts.queue
	const _scheduler = opts.scheduler

	return {
		// Lazy db getter
		get db() {
			if (_db === undefined) {
				_db = opts.db ?? null
			}
			if (_db === null) {
				throw new Error(
					'Database not configured. Add database config to bunbase.config.ts',
				)
			}
			return _db
		},

		// Lazy storage getter
		get storage() {
			if (_storage === undefined) {
				_storage = opts.storage ?? null
			}
			if (_storage === null) {
				throw new Error(
					'Storage not configured. Add storage config to bunbase.config.ts',
				)
			}
			return _storage
		},

		// Lazy kv getter
		get kv() {
			if (_kv === undefined) {
				_kv = opts.kv ?? null
			}
			if (_kv === null) {
				throw new Error(
					'KV store not configured. Add kv config to bunbase.config.ts',
				)
			}
			return _kv
		},

		// Eager fields (lightweight, always needed)
		logger: opts.logger,
		traceId: opts.traceId,
		event: {
			emit: (name: string, payload?: unknown) => {
				eventBus.emit(name, payload)
			},
		},
		auth: {
			...(opts.auth ?? {}),

			// Lazy user loader - fetches full user data from DB
			user:
				opts.db && opts.auth?.userId
					? async () => {
							const database = opts.db
							if (!database) return null

							const user = await database
								.from('users')
								.eq('id', opts.auth!.userId!)
								.maybeSingle()

							return user as any
						}
					: undefined,

			// Lazy team/org loader - fetches full team data from DB
			team:
				opts.db && opts.auth?.orgId
					? async () => {
							const database = opts.db
							if (!database) return null

							const team = await database
								.from('organizations')
								.eq('id', opts.auth!.orgId!)
								.maybeSingle()

							return team as any
						}
					: undefined,
		},
		module: opts.moduleName ? { name: opts.moduleName } : undefined,
		retry: { attempt: 1, maxAttempts: 1 },
		response: opts.response,
		request: opts.request,
		registry: opts.registry,

		// Lazy IAM context - only initialized when accessed
		get iam() {
			if (_iam === undefined) {
				// Check if we have database access
				const database = opts.db ?? null
				if (!database) {
					throw new Error(
						'IAM not available: Database not configured. Add database config to bunbase.config.ts',
					)
				}

				_iam = createIAMContext({
					db: database,
					roleKey: opts.auth?.role,
					logger: opts.logger,
				})
			}
			return _iam
		},

		// schedule function (lightweight)
		schedule: async (time, name, data, scheduleOpts) => {
			if (!queue) {
				throw new Error('Queue not configured. Call server.setQueue() first.')
			}
			// Schedule via queue with delay
			const _delay = typeof time === 'number' ? time : 0
			return queue.push(name, data, {
				...scheduleOpts,
				priority: scheduleOpts?.priority,
			})
		},

		// Lazy queue getter - create wrapper object only when accessed
		get queue() {
			if (_queue === undefined) {
				if (!queue) {
					throw new Error('Queue not configured. Call server.setQueue() first.')
				}

				_queue = {
					add: async (name, data, opts) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.add(name, data, opts)
					},
					push: async (name, data, opts) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.push(name, data, opts)
					},
					get: async (jobId) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.get(jobId)
					},
					getAll: async (opts) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.getAll({
							status: opts?.status as any,
							name: opts?.name,
							limit: opts?.limit,
						})
					},
					update: async (jobId, updates) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.update(jobId, updates)
					},
					delete: async (jobId) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.delete(jobId)
					},
					remove: async (jobId) => {
						if (!queue) {
							throw new Error(
								'Queue not configured. Call server.setQueue() first.',
							)
						}
						return queue.remove(jobId)
					},
				}
			}
			return _queue
		},
	}
}
