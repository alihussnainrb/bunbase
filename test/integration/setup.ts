/**
 * Integration test harness for Bunbase.
 * Provides utilities for setting up test environments with database, server, and cleanup.
 */

import { afterAll, beforeAll } from 'bun:test'
import { createSQLPool } from '../../packages/bunbase/src/db/pool.ts'
import { createDB } from '../../packages/bunbase/src/db/client.ts'
import { Logger } from '../../packages/bunbase/src/logger/index.ts'
import { WriteBuffer } from '../../packages/bunbase/src/persistence/write-buffer.ts'
import { ActionRegistry } from '../../packages/bunbase/src/core/registry.ts'
import { BunbaseServer } from '../../packages/bunbase/src/runtime/server.ts'
import { Queue } from '../../packages/bunbase/src/runtime/queue.ts'
import type { ActionContext } from '../../packages/bunbase/src/core/types.ts'
import type { DatabaseClient } from '../../packages/bunbase/src/db/client.ts'

/**
 * Test environment configuration
 */
export interface TestEnv {
	/** SQL pool for raw queries */
	sqlPool: ReturnType<typeof createSQLPool>
	/** Typed database client */
	db: DatabaseClient
	/** Logger instance */
	logger: Logger
	/** Write buffer for persistence */
	writeBuffer: WriteBuffer
	/** Action registry */
	registry: ActionRegistry
	/** Queue for background jobs */
	queue: Queue
	/** Server instance (if started) */
	server?: BunbaseServer
	/** Server port (if started) */
	port?: number
}

/**
 * Creates a test environment with all necessary components.
 * Uses TEST_DATABASE_URL env var for database connection.
 */
export function createTestEnv(): TestEnv {
	const testDbUrl =
		process.env.TEST_DATABASE_URL ||
		'postgresql://postgres:postgres@localhost:5432/bunbase_test'

	const sqlPool = createSQLPool({
		url: testDbUrl,
		max: 5, // Lower connection limit for tests
		idleTimeout: 10000,
	})

	const db = createDB(sqlPool)

	const logger = new Logger({
		level: 'error', // Quiet during tests
	})

	const writeBuffer = new WriteBuffer({
		enabled: false, // Disable persistence in tests by default
		flushIntervalMs: 10000,
		maxBufferSize: 100,
	})

	const registry = new ActionRegistry()
	const queue = new Queue(sqlPool, logger, writeBuffer)

	return {
		sqlPool,
		db,
		logger,
		writeBuffer,
		registry,
		queue,
	}
}

/**
 * Starts a test server with the given registry.
 * Returns the server instance and port.
 */
export function startTestServer(env: TestEnv): {
	server: BunbaseServer
	port: number
} {
	const server = new BunbaseServer(env.registry, env.logger, env.writeBuffer, {
		port: 0, // Random available port
		database: {},
	})

	server.setQueue(env.queue)

	const bunServer = server.start({ port: 0 })
	const port = bunServer.port

	env.server = server
	env.port = port

	return { server, port }
}

/**
 * Cleans up test environment resources.
 */
export async function cleanupTestEnv(env: TestEnv): Promise<void> {
	// Stop server
	if (env.server) {
		env.server.stop()
	}

	// Stop queue
	if (env.queue) {
		await env.queue.stop()
	}

	// Flush write buffer
	if (env.writeBuffer) {
		await env.writeBuffer.flush()
	}

	// End SQL pool
	if (env.sqlPool) {
		await env.sqlPool.end()
	}
}

/**
 * Cleans up test data from the database.
 * Only removes data created during tests, not schema.
 */
export async function cleanupTestData(env: TestEnv): Promise<void> {
	try {
		// Clean up action_runs and action_logs
		await env.sqlPool`DELETE FROM action_logs WHERE created_at > 0`
		await env.sqlPool`DELETE FROM action_runs WHERE created_at > 0`

		// Clean up job_queue and job_failures
		await env.sqlPool`DELETE FROM job_queue WHERE created_at > NOW() - INTERVAL '1 hour'`
		await env.sqlPool`DELETE FROM job_failures WHERE failed_at > NOW() - INTERVAL '1 hour'`

		// Clean up test users (keep initial seed data)
		await env.sqlPool`DELETE FROM users WHERE email LIKE '%test%'`
	} catch (err) {
		// Ignore errors (tables might not exist yet)
	}
}

/**
 * Creates a mock ActionContext for testing.
 */
export function createTestContext(
	env: TestEnv,
	overrides?: Partial<ActionContext>,
): ActionContext {
	return {
		traceId: `test-${Date.now()}`,
		triggerType: 'test',
		logger: env.logger,
		db: env.db,
		queue: env.queue,
		auth: {
			userId: undefined,
			role: undefined,
			permissions: undefined,
			createSession: () => {
				throw new Error('Not implemented in test context')
			},
			destroySession: () => {
				throw new Error('Not implemented in test context')
			},
			logout: () => {
				throw new Error('Not implemented in test context')
			},
			loginWithEmail: async () => {
				throw new Error('Not implemented in test context')
			},
			loginWithUsername: async () => {
				throw new Error('Not implemented in test context')
			},
			loginWithPhone: async () => {
				throw new Error('Not implemented in test context')
			},
			signup: async () => {
				throw new Error('Not implemented in test context')
			},
			can: async () => ({ allowed: false }),
			canAll: async () => new Map(),
			hasRole: () => false,
		},
		event: {
			emit: () => {},
			on: () => {},
		},
		scheduler: {
			schedule: async () => {
				throw new Error('Not implemented in test context')
			},
		},
		retry: {
			attempt: 1,
			maxAttempts: 1,
		},
		...overrides,
	} as ActionContext
}

/**
 * Waits for a condition to be true, with timeout.
 */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeoutMs: number = 5000,
	checkIntervalMs: number = 100,
): Promise<void> {
	const startTime = Date.now()

	while (Date.now() - startTime < timeoutMs) {
		if (await condition()) {
			return
		}
		await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))
	}

	throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`)
}

/**
 * Helper to setup and teardown test environment in beforeAll/afterAll.
 */
export function useTestEnv() {
	let env: TestEnv

	beforeAll(() => {
		env = createTestEnv()
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	return {
		getEnv: () => env,
	}
}
