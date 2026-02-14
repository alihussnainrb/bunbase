import { describe, expect, test, afterEach } from 'bun:test'
import { createTestEnv, cleanupTestEnv, startTestServer } from './setup.ts'

describe('Integration: Health Check Endpoints', () => {
	const env = createTestEnv()
	let baseUrl: string

	afterEach(async () => {
		await cleanupTestEnv(env)
	})

	test('/_health/live returns 200 when server is running', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const response = await fetch(`${baseUrl}/_health/live`)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.status).toBe('ok')
		expect(data.timestamp).toBeGreaterThan(0)
		expect(data.uptime).toBeGreaterThanOrEqual(0)
	})

	test('/_health/ready checks database connectivity', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const response = await fetch(`${baseUrl}/_health/ready`)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.status).toBe('ok')
		expect(data.checks.database).toBeDefined()
		expect(data.checks.database.status).toBe('ok')
		expect(data.checks.database.latency).toBeGreaterThanOrEqual(0)
	})

	test('/_health returns full health check with all dependencies', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const response = await fetch(`${baseUrl}/_health`)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.status).toBe('ok')
		expect(data.timestamp).toBeGreaterThan(0)
		expect(data.uptime).toBeGreaterThanOrEqual(0)
		expect(data.checks).toBeDefined()
		expect(data.checks.database).toBeDefined()
		expect(data.checks.database.status).toBe('ok')
		expect(data.registry).toBeDefined()
		expect(typeof data.registry.actions).toBe('number')
		expect(typeof data.registry.locked).toBe('boolean')
	})

	test('/_health returns 503 when database is down', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		// Close the database connection to simulate failure
		await env.sqlPool.end()

		const response = await fetch(`${baseUrl}/_health`)
		const data = await response.json()

		expect(response.status).toBe(503)
		expect(data.status).toBe('degraded')
		expect(data.checks.database).toBeDefined()
		expect(data.checks.database.status).toBe('error')
		expect(data.checks.database.error).toBeDefined()
	})

	test('health check endpoints return JSON content-type', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const liveResponse = await fetch(`${baseUrl}/_health/live`)
		expect(liveResponse.headers.get('content-type')).toContain('application/json')

		const readyResponse = await fetch(`${baseUrl}/_health/ready`)
		expect(readyResponse.headers.get('content-type')).toContain('application/json')

		const fullResponse = await fetch(`${baseUrl}/_health`)
		expect(fullResponse.headers.get('content-type')).toContain('application/json')
	})

	test('health check endpoints work with CORS', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		// Make a request with Origin header to test CORS
		const response = await fetch(`${baseUrl}/_health`, {
			headers: {
				Origin: 'http://example.com',
			},
		})

		// Server should add CORS headers if configured
		// (CORS config is optional, so we just check the endpoint works)
		expect(response.status).toBe(200)
	})

	test('/_health includes registry info', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const response = await fetch(`${baseUrl}/_health`)
		const data = await response.json()

		expect(data.registry).toBeDefined()
		expect(data.registry.actions).toBeGreaterThanOrEqual(0)
		expect(typeof data.registry.locked).toBe('boolean')
	})

	test('/_health/ready does NOT include registry info', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const response = await fetch(`${baseUrl}/_health/ready`)
		const data = await response.json()

		expect(data.registry).toBeUndefined()
	})

	test('health check latency is measured correctly', async () => {
		const { port } = startTestServer(env)
		baseUrl = `http://localhost:${port}`

		const response = await fetch(`${baseUrl}/_health`)
		const data = await response.json()

		// Database latency should be a positive number
		expect(data.checks.database.latency).toBeGreaterThan(0)
		// Sanity check: latency should be less than 1000ms for local DB
		expect(data.checks.database.latency).toBeLessThan(1000)
	})
})
