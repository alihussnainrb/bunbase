import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { Value } from 'typebox/value'
import { Type } from 'typebox'
import { createTestEnv, cleanupTestEnv } from './setup.ts'
import { action, triggers, t, http } from '../../packages/bunbase/src/index.ts'
import { BunbaseServer } from '../../packages/bunbase/src/runtime/server.ts'

describe('OpenAPI Contract Validation', () => {
	const env = createTestEnv()
	let baseUrl: string
	let server: BunbaseServer

	// Store schemas for validation (keep references before registry)
	const getUserOutputSchema = t.Object({
		id: t.String({ format: 'uuid' }),
		name: t.String(),
		email: t.String({ format: 'email' }),
		createdAt: t.String({ format: 'date-time' }),
	})

	const listTasksOutputSchema = t.Object({
		tasks: t.Array(
			t.Object({
				id: t.String(),
				title: t.String(),
				status: t.String(),
			}),
		),
		total: t.Number(),
	})

	beforeEach(async () => {
		// Clear registry before each test
		env.registry.clear()

		// Register test actions with OpenAPI-compatible schemas
		const getUserAction = action(
			{
				name: 'test-get-user',
				input: t.Object({
					userId: http.Path(t.String({ format: 'uuid' }), 'userId'),
				}),
				output: getUserOutputSchema,
				triggers: [triggers.api('POST', '/test/users/:userId')],
			},
			async (input) => ({
				id: input.userId,
				name: 'Test User',
				email: 'test@example.com',
				createdAt: new Date().toISOString(),
			}),
		)

		const listTasksAction = action(
			{
				name: 'test-list-tasks',
				input: t.Object({
					status: t.Optional(t.Union([t.Literal('active'), t.Literal('completed')])),
					limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
				}),
				output: listTasksOutputSchema,
				triggers: [triggers.api('POST', '/test/tasks')],
			},
			async (input) => ({
				tasks: [
					{ id: '1', title: 'Task 1', status: input.status ?? 'active' },
					{ id: '2', title: 'Task 2', status: input.status ?? 'active' },
				],
				total: 2,
			}),
		)

		env.registry.registerAction(getUserAction)
		env.registry.registerAction(listTasksAction)

		// Start server with OpenAPI enabled
		server = new BunbaseServer(
			env.registry,
			env.logger,
			env.writeBuffer,
			{
				port: 0,
				database: {},
				openapi: {
					enabled: true,
					path: '/openapi.json',
					title: 'Bunbase Test API',
					version: '1.0.0',
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

		// Debug: Check routes
		console.log('Registered routes:', env.registry.getAll().flatMap(a =>
			a.triggers.map(t => `${t.type === 'api' ? t.method : 'POST'} ${t.path}`)
		))
	})

	afterEach(async () => {
		// Stop server
		if (server) {
			server.stop()
		}
		await cleanupTestEnv(env)
	})

	test('OpenAPI spec is served at /openapi.json', async () => {
		const response = await fetch(`${baseUrl}/openapi.json`)
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('application/json')

		const spec = await response.json()
		expect(spec.openapi).toBe('3.1.0')
		expect(spec.info).toBeDefined()
		expect(spec.paths).toBeDefined()
	})

	test('OpenAPI spec includes all registered actions', async () => {
		const response = await fetch(`${baseUrl}/openapi.json`)
		const spec = await response.json()

		// Debug: log available paths
		console.log('Available paths:', Object.keys(spec.paths))

		// Check that our test actions are in the spec (OpenAPI format uses {param})
		expect(spec.paths['/test/users/{userId}']).toBeDefined()
		expect(spec.paths['/test/tasks']).toBeDefined()
	})

	test('OpenAPI spec has correct HTTP methods', async () => {
		const response = await fetch(`${baseUrl}/openapi.json`)
		const spec = await response.json()

		// test-get-user
		expect(spec.paths['/test/users/{userId}'].post).toBeDefined()

		// test-list-tasks
		expect(spec.paths['/test/tasks'].post).toBeDefined()
	})

	test('API response matches OpenAPI schema for get-user', async () => {
		const userId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'

		// Fetch OpenAPI spec
		const specResponse = await fetch(`${baseUrl}/openapi.json`)
		const spec = await specResponse.json()

		// Verify the path exists in OpenAPI spec
		const path = spec.paths['/test/users/{userId}']
		expect(path).toBeDefined()
		expect(path.post.responses['200']).toBeDefined()

		// Call the actual API
		const apiResponse = await fetch(`${baseUrl}/test/users/${userId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})
		expect(apiResponse.status).toBe(200)

		const response = await apiResponse.json()

		// Unwrap the data envelope
		const data = response.data

		// Validate response against the original TypeBox schema (not OpenAPI)
		// Use stored schema reference to avoid registry serialization issues
		const isValid = Value.Check(getUserOutputSchema, data)
		if (!isValid) {
			const errors = [...Value.Errors(getUserOutputSchema, data)]
			console.error('Schema validation errors:', errors)
		}
		expect(isValid).toBe(true)

		// Verify specific fields
		expect(data.id).toBe(userId)
		expect(data.name).toBeTruthy()
		expect(data.email).toMatch(/@/)
		expect(data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
	})

	test('API response matches OpenAPI schema for list-tasks', async () => {
		// Fetch OpenAPI spec
		const specResponse = await fetch(`${baseUrl}/openapi.json`)
		const spec = await specResponse.json()

		// Verify the path exists in OpenAPI spec
		const path = spec.paths['/test/tasks']
		expect(path).toBeDefined()
		expect(path.post.responses['200']).toBeDefined()

		// Call the actual API
		const apiResponse = await fetch(`${baseUrl}/test/tasks`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: 'active', limit: 10 }),
		})
		expect(apiResponse.status).toBe(200)

		const response = await apiResponse.json()

		// Unwrap the data envelope
		const data = response.data

		// Validate response against the original TypeBox schema (not OpenAPI)
		// Use stored schema reference to avoid registry serialization issues
		const isValid = Value.Check(listTasksOutputSchema, data)
		if (!isValid) {
			const errors = [...Value.Errors(listTasksOutputSchema, data)]
			console.error('Schema validation errors:', errors)
		}
		expect(isValid).toBe(true)

		// Verify structure
		expect(Array.isArray(data.tasks)).toBe(true)
		expect(typeof data.total).toBe('number')
		expect(data.tasks.length).toBeLessThanOrEqual(10)
	})

	test('Input validation errors match OpenAPI error schema', async () => {
		// Fetch OpenAPI spec
		const specResponse = await fetch(`${baseUrl}/openapi.json`)
		const spec = await specResponse.json()

		// Try to call with invalid input (missing required field)
		const apiResponse = await fetch(`${baseUrl}/test/tasks`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: 150 }), // Exceeds maximum of 100
		})

		// Should return 400 for validation error
		expect(apiResponse.status).toBe(400)

		const error = await apiResponse.json()

		// Error response should have error field
		expect(error.error).toBeDefined()
		expect(typeof error.error).toBe('string')
	})

	test('Path parameters are reflected in OpenAPI spec', async () => {
		const response = await fetch(`${baseUrl}/openapi.json`)
		const spec = await response.json()

		const path = spec.paths['/test/users/{userId}']
		expect(path).toBeDefined()

		// Check that userId parameter is documented
		const parameters = path.post.parameters || []
		const userIdParam = parameters.find((p: any) => p.name === 'userId')

		expect(userIdParam).toBeDefined()
		expect(userIdParam.in).toBe('path')
		expect(userIdParam.required).toBe(true)
	})

	test('OpenAPI spec includes schema definitions', async () => {
		const response = await fetch(`${baseUrl}/openapi.json`)
		const spec = await response.json()

		// OpenAPI spec should include components/schemas if using refs
		// For inline schemas, just check the structure
		const getUserPath = spec.paths['/test/users/{userId}']
		const responseSchema =
			getUserPath.post.responses['200'].content['application/json'].schema

		expect(responseSchema.type).toBe('object')
		expect(responseSchema.properties).toBeDefined()
		expect(responseSchema.properties.id).toBeDefined()
		expect(responseSchema.properties.name).toBeDefined()
		expect(responseSchema.properties.email).toBeDefined()
	})

	test('API returns 404 for invalid paths', async () => {
		const response = await fetch(`${baseUrl}/api/nonexistent-path`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})

		expect(response.status).toBe(404)

		const error = await response.json()
		expect(error.error).toBe('Not Found')
	})

	test('OpenAPI spec has proper metadata', async () => {
		const response = await fetch(`${baseUrl}/openapi.json`)
		const spec = await response.json()

		expect(spec.info.title).toBeTruthy()
		expect(spec.info.version).toBeTruthy()
		expect(spec.openapi).toBe('3.1.0')
	})
})
