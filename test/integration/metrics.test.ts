import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from './setup.ts'
import { action, triggers, t } from '../../packages/bunbase/src/index.ts'
import { BunbaseServer } from '../../packages/bunbase/src/runtime/server.ts'

describe('Metrics Collection', () => {
	const env = createTestEnv()
	let baseUrl: string
	let server: BunbaseServer

	beforeAll(async () => {
		// Register test action
		const testAction = action(
			{
				name: 'test-metrics-action',
				input: t.Object({
					value: t.Number(),
				}),
				output: t.Object({
					result: t.Number(),
				}),
				triggers: [triggers.api('POST', '/test/metrics')],
			},
			async (input) => ({
				result: input.value * 2,
			}),
		)

		env.registry.registerAction(testAction)

		// Start server with metrics enabled
		server = new BunbaseServer(
			env.registry,
			env.logger,
			env.writeBuffer,
			{
				port: 0,
				database: {},
				observability: {
					enabled: true,
					metrics: {
						enabled: true,
						path: '/_metrics',
						includeDefaultMetrics: true,
					},
				},
			},
			{
				sql: env.sqlPool,
				db: env.db,
			},
		)

		server.setQueue(env.queue)

		const bunServer = server.start({ port: 0 })
		const port = bunServer.port
		baseUrl = `http://localhost:${port}`
	})

	afterAll(async () => {
		if (server) {
			server.stop()
		}
		await cleanupTestEnv(env)
	})

	test('/_metrics endpoint returns Prometheus format', async () => {
		const response = await fetch(`${baseUrl}/_metrics`)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('text/plain')

		const metrics = await response.text()
		expect(metrics).toContain('# HELP')
		expect(metrics).toContain('# TYPE')
	})

	test('System uptime metric is present', async () => {
		const response = await fetch(`${baseUrl}/_metrics`)
		const metrics = await response.text()

		expect(metrics).toContain('bunbase_uptime_seconds')
		expect(metrics).toMatch(/bunbase_uptime_seconds \d+/)
	})

	test('HTTP request metrics are tracked', async () => {
		// Make a test request
		await fetch(`${baseUrl}/test/metrics`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 42 }),
		})

		// Check metrics
		const metricsResponse = await fetch(`${baseUrl}/_metrics`)
		const metrics = await metricsResponse.text()

		// Check for HTTP request counter
		expect(metrics).toContain('bunbase_http_requests_total')
		expect(metrics).toMatch(/bunbase_http_requests_total\{.*method="POST".*\}/)

		// Check for HTTP request duration histogram
		expect(metrics).toContain('bunbase_http_request_duration_ms')
		expect(metrics).toContain('bunbase_http_request_duration_ms_bucket')
		expect(metrics).toContain('bunbase_http_request_duration_ms_sum')
		expect(metrics).toContain('bunbase_http_request_duration_ms_count')
	})

	test('Action execution metrics are tracked', async () => {
		// Make a test request
		await fetch(`${baseUrl}/test/metrics`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 42 }),
		})

		// Check metrics
		const metricsResponse = await fetch(`${baseUrl}/_metrics`)
		const metrics = await metricsResponse.text()

		// Check for action execution counter
		expect(metrics).toContain('bunbase_action_executions_total')
		expect(metrics).toMatch(/bunbase_action_executions_total\{.*action="test-metrics-action".*status="success".*\}/)

		// Check for action duration histogram
		expect(metrics).toContain('bunbase_action_duration_ms')
		expect(metrics).toMatch(/bunbase_action_duration_ms_bucket\{.*action="test-metrics-action".*\}/)
	})

	test('Error metrics are tracked for failed actions', async () => {
		// Make a request with invalid input (expecting number, sending string)
		await fetch(`${baseUrl}/test/metrics`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 'invalid' }),
		})

		// Check metrics
		const metricsResponse = await fetch(`${baseUrl}/_metrics`)
		const metrics = await metricsResponse.text()

		// Check for error counter
		expect(metrics).toContain('bunbase_errors_total')
		expect(metrics).toMatch(/bunbase_errors_total\{.*type="ActionValidationError".*\}/)

		// Check for failed action execution
		expect(metrics).toMatch(/bunbase_action_executions_total\{.*status="error".*\}/)
	})

	test('Default metrics include process metrics', async () => {
		const response = await fetch(`${baseUrl}/_metrics`)
		const metrics = await response.text()

		// Check for process memory metrics
		expect(metrics).toContain('process_memory_bytes')
		expect(metrics).toMatch(/process_memory_bytes\{type="rss"\}/)
		expect(metrics).toMatch(/process_memory_bytes\{type="heap_total"\}/)
		expect(metrics).toMatch(/process_memory_bytes\{type="heap_used"\}/)

		// Check for process CPU metrics
		expect(metrics).toContain('process_cpu_seconds_total')
		expect(metrics).toMatch(/process_cpu_seconds_total\{type="user"\}/)
		expect(metrics).toMatch(/process_cpu_seconds_total\{type="system"\}/)
	})

	test('Histogram buckets are properly configured', async () => {
		// Make a test request
		await fetch(`${baseUrl}/test/metrics`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ value: 42 }),
		})

		// Check metrics
		const metricsResponse = await fetch(`${baseUrl}/_metrics`)
		const metrics = await metricsResponse.text()

		// Check for histogram buckets (default: 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000)
		expect(metrics).toMatch(/bunbase_action_duration_ms_bucket\{.*le="10".*\}/)
		expect(metrics).toMatch(/bunbase_action_duration_ms_bucket\{.*le="50".*\}/)
		expect(metrics).toMatch(/bunbase_action_duration_ms_bucket\{.*le="100".*\}/)
		expect(metrics).toMatch(/bunbase_action_duration_ms_bucket\{.*le="\+Inf".*\}/)
	})
})
