import type { BunbaseConfig } from '../config/types.ts'
import { ActionRegistry } from '../core/registry.ts'
import type { ActionDefinition, ModuleDefinition } from '../core/types.ts'
import { createDB } from '../db/client.ts'
import { createSQLPool } from '../db/pool.ts'
import { Logger } from '../logger/index.ts'
import { WriteBuffer } from '../persistence/write-buffer.ts'
import { BunbaseServer } from '../runtime/server.ts'

export interface TestServerOptions {
	/** Standalone actions to register */
	actions?: ActionDefinition[]
	/** Modules to register */
	modules?: ModuleDefinition[]
	/** Partial config override */
	config?: Partial<BunbaseConfig>
	/** Port to bind to (0 for random port) */
	port?: number
}

export interface TestServer {
	/** The running server instance */
	server: BunbaseServer
	/** Base URL to make requests to */
	baseUrl: string
	/** Action registry (for inspection) */
	registry: ActionRegistry
	/** Close the server and cleanup */
	close: () => void
}

/**
 * Create a test server with actions/modules for integration testing.
 *
 * @example
 * ```typescript
 * const { baseUrl, close } = createTestServer({
 *   actions: [createTaskAction],
 * })
 *
 * const res = await fetch(`${baseUrl}/tasks`, { method: 'POST', ... })
 * expect(res.status).toBe(200)
 *
 * close()
 * ```
 */
export function createTestServer(opts: TestServerOptions = {}): TestServer {
	const registry = new ActionRegistry()

	// Register modules first
	for (const mod of opts.modules ?? []) {
		registry.registerModule(mod)
	}

	// Register standalone actions
	for (const action of opts.actions ?? []) {
		registry.registerAction(action)
	}

	const logger = new Logger({ level: 'error' }) // Silent in tests
	const writeBuffer = new WriteBuffer({ enabled: false })
	const sqlPool = createSQLPool({
		url: process.env.DATABASE_URL,
	})
	const db = createDB(sqlPool)

	const config: BunbaseConfig = {
		port: opts.port ?? 0,
		hostname: '127.0.0.1',
		...(opts.config ?? {}),
	}

	const server = new BunbaseServer(registry, logger, writeBuffer, config, {
		db,
	})

	const { port } = server.start({
		port: config.port,
		hostname: config.hostname,
	})

	return {
		server,
		baseUrl: `http://127.0.0.1:${port}`,
		registry,
		close: () => {
			server.stop()
			sqlPool.close()
		},
	}
}

export interface TestResponse {
	status: number
	headers: Headers
	json: () => Promise<any>
	text: () => Promise<string>
}

/**
 * Type-safe test HTTP client.
 *
 * @example
 * ```typescript
 * const client = createTestClient(baseUrl)
 *
 * const res = await client.post('/tasks', { title: 'Test' })
 * expect(res.status).toBe(200)
 * const data = await res.json()
 * expect(data.task.title).toBe('Test')
 * ```
 */
export function createTestClient(baseUrl: string) {
	return {
		async get(path: string, init?: RequestInit): Promise<TestResponse> {
			const res = await fetch(`${baseUrl}${path}`, { ...init, method: 'GET' })
			return {
				status: res.status,
				headers: res.headers,
				json: () => res.json(),
				text: () => res.text(),
			}
		},

		async post(
			path: string,
			body?: unknown,
			init?: RequestInit,
		): Promise<TestResponse> {
			const res = await fetch(`${baseUrl}${path}`, {
				...init,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(init?.headers ?? {}),
				},
				body: JSON.stringify(body),
			})
			return {
				status: res.status,
				headers: res.headers,
				json: () => res.json(),
				text: () => res.text(),
			}
		},

		async put(
			path: string,
			body?: unknown,
			init?: RequestInit,
		): Promise<TestResponse> {
			const res = await fetch(`${baseUrl}${path}`, {
				...init,
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					...(init?.headers ?? {}),
				},
				body: JSON.stringify(body),
			})
			return {
				status: res.status,
				headers: res.headers,
				json: () => res.json(),
				text: () => res.text(),
			}
		},

		async patch(
			path: string,
			body?: unknown,
			init?: RequestInit,
		): Promise<TestResponse> {
			const res = await fetch(`${baseUrl}${path}`, {
				...init,
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					...(init?.headers ?? {}),
				},
				body: JSON.stringify(body),
			})
			return {
				status: res.status,
				headers: res.headers,
				json: () => res.json(),
				text: () => res.text(),
			}
		},

		async delete(path: string, init?: RequestInit): Promise<TestResponse> {
			const res = await fetch(`${baseUrl}${path}`, {
				...init,
				method: 'DELETE',
			})
			return {
				status: res.status,
				headers: res.headers,
				json: () => res.json(),
				text: () => res.text(),
			}
		},
	}
}
