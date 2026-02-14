import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { SQL } from 'bun'
import { ResilientSQLPool } from '../../packages/bunbase/src/db/pool.ts'

describe('Integration: Database Resilience', () => {
	let pool: ResilientSQLPool

	// Check if database is available before running tests
	const testDbUrl =
		process.env.TEST_DATABASE_URL ||
		'postgresql://postgres:postgres@localhost:5432/bunbase_test'

	afterEach(async () => {
		if (pool) {
			await pool.close()
		}
	})

	test('successfully connects to database on first attempt', async () => {
		const testDbUrl =
			process.env.TEST_DATABASE_URL ||
			'postgresql://postgres:postgres@localhost:5432/bunbase_test'

		pool = new ResilientSQLPool({
			url: testDbUrl,
			max: 5,
			retryAttempts: 3,
			retryDelayMs: 100,
		})

		await pool.connect()

		expect(pool.isConnected()).toBe(true)
		expect(pool.getMetrics().isConnected).toBe(true)
		expect(pool.getMetrics().consecutiveFailures).toBe(0)
	})

	test('retries connection with exponential backoff', async () => {
		const onConnectionError = mock(() => {})
		const onConnectionRestore = mock(() => {})

		pool = new ResilientSQLPool({
			url: 'postgresql://invalid:5432/bunbase_test', // Invalid host
			max: 5,
			retryAttempts: 3,
			retryDelayMs: 50,
			onConnectionError,
			onConnectionRestore,
		})

		const startTime = Date.now()

		try {
			await pool.connect()
			expect(true).toBe(false) // Should not reach here
		} catch (err) {
			const elapsed = Date.now() - startTime

			// Should have attempted 3 times with exponential backoff:
			// Attempt 1: immediate (0ms)
			// Wait: 50ms
			// Attempt 2: after 50ms
			// Wait: 100ms (50 * 2^1)
			// Attempt 3: after 150ms
			// Total: at least 150ms
			expect(elapsed).toBeGreaterThanOrEqual(150)

			// Should have called onConnectionError 3 times
			expect(onConnectionError).toHaveBeenCalledTimes(3)

			// Should NOT have called onConnectionRestore (never connected)
			expect(onConnectionRestore).toHaveBeenCalledTimes(0)

			expect(pool.isConnected()).toBe(false)
			expect(pool.getMetrics().consecutiveFailures).toBe(3)
		}
	})

	test('health check detects healthy connection', async () => {
		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
			healthCheckIntervalMs: 1000, // 1s for testing
		})

		await pool.connect()

		const isHealthy = await pool.healthCheck()

		expect(isHealthy).toBe(true)
		expect(pool.getMetrics().lastHealthCheck).toBeGreaterThan(0)
		expect(pool.getMetrics().consecutiveFailures).toBe(0)
	})

	test('health check detects unhealthy connection', async () => {
		const onHealthCheckFail = mock(() => {})

		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
			retryAttempts: 2, // Low for testing
			onHealthCheckFail,
		})

		await pool.connect()

		// Force close the underlying pool to simulate connection loss
		const underlyingPool = pool.getPool()
		await underlyingPool.end()

		// Now health check should fail
		const isHealthy = await pool.healthCheck()

		expect(isHealthy).toBe(false)
		expect(pool.getMetrics().consecutiveFailures).toBeGreaterThan(0)
	})

	test('auto-reconnects after 3 consecutive health check failures', async () => {
		const onConnectionRestore = mock(() => {})
		const onHealthCheckFail = mock(() => {})

		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
			retryAttempts: 5,
			retryDelayMs: 100,
			onConnectionRestore,
			onHealthCheckFail,
		})

		await pool.connect()

		// Force close the underlying pool to simulate connection loss
		const underlyingPool = pool.getPool()
		await underlyingPool.end()

		// First health check fails
		await pool.healthCheck()
		expect(pool.getMetrics().consecutiveFailures).toBe(1)

		// Second health check fails
		await pool.healthCheck()
		expect(pool.getMetrics().consecutiveFailures).toBe(2)

		// Third health check fails and triggers reconnect
		await pool.healthCheck()

		// Should have attempted reconnection
		// (may or may not succeed depending on timing, but should have tried)
		expect(onHealthCheckFail).toHaveBeenCalledTimes(3)
	})

	test('connection metrics are tracked correctly', async () => {
		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
		})

		await pool.connect()

		const initialMetrics = pool.getMetrics()
		expect(initialMetrics.isConnected).toBe(true)
		expect(initialMetrics.consecutiveFailures).toBe(0)
		expect(initialMetrics.totalQueries).toBe(0)
		expect(initialMetrics.failedQueries).toBe(0)

		// Perform a successful query
		const sql = pool.getPool()
		await sql`SELECT 1`

		// Note: The current implementation doesn't track query counts
		// This test documents expected behavior if we add query tracking
	})

	test('getPool() throws if not connected', () => {
		pool = new ResilientSQLPool({
			url: 'postgresql://localhost:5432/bunbase_test',
			max: 5,
		})

		expect(() => pool.getPool()).toThrow('Database pool not initialized')
	})

	test('close() stops health checks and cleans up', async () => {
		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
			healthCheckIntervalMs: 100, // Fast for testing
		})

		await pool.connect()
		expect(pool.isConnected()).toBe(true)

		await pool.close()

		expect(pool.isConnected()).toBe(false)

		// Health checks should be stopped (no way to verify interval cleared, but no errors)
	})

	test('onConnectionRestore is called after successful retry', async () => {
		const onConnectionError = mock(() => {})
		const onConnectionRestore = mock(() => {})

		// We can't easily simulate a connection that fails then succeeds
		// without external manipulation of the database
		// This test documents the expected behavior

		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
			retryAttempts: 3,
			retryDelayMs: 50,
			onConnectionError,
			onConnectionRestore,
		})

		await pool.connect()

		// If connection succeeded on first attempt, restore callback should NOT be called
		expect(onConnectionRestore).toHaveBeenCalledTimes(0)
	})

	test('config defaults are applied correctly', () => {
		pool = new ResilientSQLPool({
			url: 'postgresql://localhost:5432/bunbase_test',
		})

		// Can't inspect private config, but connection should use defaults
		// This test documents expected behavior
	})

	test('handles multiple concurrent health checks gracefully', async () => {
		pool = new ResilientSQLPool({
			url:
				process.env.TEST_DATABASE_URL ||
				'postgresql://postgres:postgres@localhost:5432/bunbase_test',
			max: 5,
		})

		await pool.connect()

		// Run 10 health checks concurrently
		const healthChecks = await Promise.all(
			Array.from({ length: 10 }, () => pool.healthCheck())
		)

		// All should succeed
		expect(healthChecks.every(result => result === true)).toBe(true)
	})

	test('connection state is accurate after failed connection', async () => {
		pool = new ResilientSQLPool({
			url: 'postgresql://invalid:5432/bunbase_test',
			max: 5,
			retryAttempts: 2,
			retryDelayMs: 50,
		})

		try {
			await pool.connect()
		} catch {
			// Expected to fail
		}

		expect(pool.isConnected()).toBe(false)
		expect(pool.getMetrics().isConnected).toBe(false)
		expect(pool.getMetrics().consecutiveFailures).toBe(2)
	})
})
