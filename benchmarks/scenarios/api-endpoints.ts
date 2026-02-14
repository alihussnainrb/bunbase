/**
 * Benchmark scenarios for API endpoints
 *
 * Defines various load testing scenarios to measure performance
 * characteristics of different types of operations.
 */

export interface BenchmarkScenario {
	name: string
	description: string
	requests?: Array<{
		method: string
		path: string
		headers?: Record<string, string>
		body?: string
	}>
}

/**
 * Simple GET request (minimal overhead)
 */
export const simpleGetScenario: BenchmarkScenario = {
	name: 'simple-get',
	description: 'Simple GET request to health endpoint (minimal logic)',
	requests: [
		{
			method: 'GET',
			path: '/_health/live',
		},
	],
}

/**
 * Health check with database and Redis checks
 */
export const healthCheckScenario: BenchmarkScenario = {
	name: 'health-check',
	description: 'Health check endpoint with database and Redis connectivity checks',
	requests: [
		{
			method: 'GET',
			path: '/_health',
		},
	],
}

/**
 * Metrics export (Prometheus format)
 */
export const metricsExportScenario: BenchmarkScenario = {
	name: 'metrics-export',
	description: 'Prometheus metrics export endpoint',
	requests: [
		{
			method: 'GET',
			path: '/_metrics',
		},
	],
}

/**
 * Simple authenticated POST action
 */
export const authPostScenario: BenchmarkScenario = {
	name: 'auth-post',
	description: 'Authenticated POST action (requires session cookie)',
	requests: [
		{
			method: 'POST',
			path: '/api/test-action',
			headers: {
				Cookie: 'bunbase_session=test-session-token',
			},
			body: JSON.stringify({ test: 'data' }),
		},
	],
}

/**
 * Database read-heavy workload
 */
export const dbReadHeavyScenario: BenchmarkScenario = {
	name: 'db-read-heavy',
	description: 'Database read-heavy workload (SELECT queries)',
	requests: [
		{
			method: 'POST',
			path: '/api/list-users',
			body: JSON.stringify({ limit: 10 }),
		},
	],
}

/**
 * Database write-heavy workload
 */
export const dbWriteHeavyScenario: BenchmarkScenario = {
	name: 'db-write-heavy',
	description: 'Database write-heavy workload (INSERT/UPDATE queries)',
	requests: [
		{
			method: 'POST',
			path: '/api/create-resource',
			body: JSON.stringify({
				name: 'Test Resource',
				description: 'Benchmark resource',
			}),
		},
	],
}

/**
 * Mixed read/write workload
 */
export const mixedWorkloadScenario: BenchmarkScenario = {
	name: 'mixed-workload',
	description: 'Mixed read/write workload (realistic usage pattern)',
	requests: [
		{
			method: 'GET',
			path: '/_health',
		},
		{
			method: 'POST',
			path: '/api/test-action',
			body: JSON.stringify({ data: 'test' }),
		},
		{
			method: 'POST',
			path: '/api/list-users',
			body: JSON.stringify({ limit: 5 }),
		},
	],
}

/**
 * Large payload request
 */
export const largePayloadScenario: BenchmarkScenario = {
	name: 'large-payload',
	description: 'Large JSON payload (1MB) request processing',
	requests: [
		{
			method: 'POST',
			path: '/api/bulk-upload',
			body: JSON.stringify({
				items: Array.from({ length: 1000 }, (_, i) => ({
					id: `item-${i}`,
					name: `Item ${i}`,
					description: `Description for item ${i}`.repeat(10),
					metadata: {
						created: new Date().toISOString(),
						tags: ['benchmark', 'test', `item-${i}`],
					},
				})),
			}),
		},
	],
}

/**
 * OpenAPI spec generation
 */
export const openapiSpecScenario: BenchmarkScenario = {
	name: 'openapi-spec',
	description: 'OpenAPI specification generation',
	requests: [
		{
			method: 'GET',
			path: '/openapi.json',
		},
	],
}

/**
 * Rate-limited endpoint
 */
export const rateLimitedScenario: BenchmarkScenario = {
	name: 'rate-limited',
	description: 'Rate-limited endpoint (tests rate limiter performance)',
	requests: [
		{
			method: 'POST',
			path: '/api/rate-limited-action',
			body: JSON.stringify({ test: 'data' }),
		},
	],
}

/**
 * All scenarios
 */
export const apiEndpointScenarios: BenchmarkScenario[] = [
	simpleGetScenario,
	healthCheckScenario,
	metricsExportScenario,
	// authPostScenario, // Requires valid session
	// dbReadHeavyScenario, // Requires database setup
	// dbWriteHeavyScenario, // Requires database setup
	// mixedWorkloadScenario, // Requires database setup
	// largePayloadScenario, // Requires specific action
	openapiSpecScenario,
	// rateLimitedScenario, // May trigger rate limits
]
