import { beforeEach, describe, expect, test } from 'bun:test'
import { ActionRegistry } from '../src/core/registry.ts'
import { action, t } from '../src/index.ts'
import type { WriteBuffer } from '../src/persistence/write-buffer.ts'
import { executeAction } from '../src/runtime/executor.ts'

// Mock WriteBuffer
function createMockWriteBuffer(): WriteBuffer {
	return {
		pushLog: () => {},
		pushRun: () => {},
		flush: async () => {},
		shutdown: async () => {},
	} as any
}

// Mock Logger
function createMockLogger() {
	return {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
		child: () => createMockLogger(),
	}
}

describe('ctx.withMeta()', () => {
	let registry: ActionRegistry
	let mockWriteBuffer: WriteBuffer
	let mockLogger: ReturnType<typeof createMockLogger>

	beforeEach(() => {
		registry = new ActionRegistry()
		mockWriteBuffer = createMockWriteBuffer()
		mockLogger = createMockLogger()
	})

	describe('basic functionality', () => {
		test('should add _meta to response data', async () => {
			const testAction = action(
				{
					name: 'withMetaBasic',
					input: t.Object({}),
					output: t.Object({
						message: t.String(),
					}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ message: 'Hello' },
						{ status: 201, headers: { 'X-Custom': 'value' } },
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('withMetaBasic')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(true)
			expect(result.data).toEqual({
				message: 'Hello',
			})
			expect(result.transportMeta).toEqual({
				status: 201,
				headers: { 'X-Custom': 'value' },
			})
		})

		test('should work with empty metadata', async () => {
			const testAction = action(
				{
					name: 'withMetaEmpty',
					input: t.Object({}),
					output: t.Object({ value: t.Number() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({ value: 42 }, {})
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('withMetaEmpty')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(true)
			expect(result.data).toEqual({
				value: 42,
			})
			expect(result.transportMeta).toEqual({})
		})

		test('should work without metadata parameter', async () => {
			const testAction = action(
				{
					name: 'withMetaNoParam',
					input: t.Object({}),
					output: t.Object({ value: t.Number() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({ value: 42 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('withMetaNoParam')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(true)
			expect(result.data).toEqual({
				value: 42,
			})
			expect(result.transportMeta).toBeUndefined()
		})
	})

	describe('HTTP status codes', () => {
		test('should set custom status code', async () => {
			const testAction = action(
				{
					name: 'customStatus',
					input: t.Object({}),
					output: t.Object({ created: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({ created: true }, { status: 201 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('customStatus')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.status).toBe(201)
			expect(result.data).toEqual({ created: true })
		})

		test('should support 204 No Content', async () => {
			const testAction = action(
				{
					name: 'noContent',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({}, { status: 204 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('noContent')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.status).toBe(204)
			expect(result.data).toEqual({})
		})

		test('should support redirect status codes', async () => {
			const testAction = action(
				{
					name: 'redirect',
					input: t.Object({}),
					output: t.Object({ url: t.String() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ url: '/new-location' },
						{
							status: 302,
							headers: { Location: '/new-location' },
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('redirect')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.status).toBe(302)
			expect(result.transportMeta?.headers?.Location).toBe('/new-location')
			expect(result.data).toEqual({ url: '/new-location' })
		})
	})

	describe('HTTP headers', () => {
		test('should set single custom header', async () => {
			const testAction = action(
				{
					name: 'singleHeader',
					input: t.Object({}),
					output: t.Object({ data: t.String() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ data: 'test' },
						{ headers: { 'X-Request-ID': '123' } },
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('singleHeader')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.headers?.['X-Request-ID']).toBe('123')
			expect(result.data).toEqual({ data: 'test' })
		})

		test('should set multiple custom headers', async () => {
			const testAction = action(
				{
					name: 'multipleHeaders',
					input: t.Object({}),
					output: t.Object({ data: t.String() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ data: 'test' },
						{
							headers: {
								'X-Request-ID': '123',
								'X-API-Version': 'v2',
								'Cache-Control': 'no-cache',
							},
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('multipleHeaders')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.headers).toEqual({
				'X-Request-ID': '123',
				'X-API-Version': 'v2',
				'Cache-Control': 'no-cache',
			})
			expect(result.data).toEqual({ data: 'test' })
		})

		test('should set Content-Type header', async () => {
			const testAction = action(
				{
					name: 'contentType',
					input: t.Object({}),
					output: t.Object({ xml: t.String() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ xml: '<data>test</data>' },
						{ headers: { 'Content-Type': 'application/xml' } },
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('contentType')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.headers?.['Content-Type']).toBe(
				'application/xml',
			)
		})
	})

	describe('cookies', () => {
		test('should set a single cookie', async () => {
			const testAction = action(
				{
					name: 'singleCookie',
					input: t.Object({}),
					output: t.Object({ success: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ success: true },
						{
							cookies: [
								{
									name: 'session',
									value: 'abc123',
									httpOnly: true,
									secure: true,
								},
							],
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('singleCookie')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.cookies).toHaveLength(1)
			expect(result.transportMeta?.cookies?.[0]).toEqual({
				name: 'session',
				value: 'abc123',
				httpOnly: true,
				secure: true,
			})
			expect(result.data).toEqual({ success: true })
		})

		test('should set multiple cookies', async () => {
			const testAction = action(
				{
					name: 'multipleCookies',
					input: t.Object({}),
					output: t.Object({ success: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ success: true },
						{
							cookies: [
								{ name: 'session', value: 'abc123' },
								{ name: 'preference', value: 'dark-mode' },
							],
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('multipleCookies')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.cookies).toHaveLength(2)
			expect(result.transportMeta?.cookies?.[0].name).toBe('session')
			expect(result.transportMeta?.cookies?.[1].name).toBe('preference')
			expect(result.data).toEqual({ success: true })
		})

		test('should set cookie with all options', async () => {
			const testAction = action(
				{
					name: 'cookieOptions',
					input: t.Object({}),
					output: t.Object({ success: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ success: true },
						{
							cookies: [
								{
									name: 'session',
									value: 'abc123',
									httpOnly: true,
									secure: true,
									sameSite: 'Strict',
									maxAge: 3600,
									path: '/',
									domain: 'example.com',
								},
							],
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('cookieOptions')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.cookies?.[0]).toEqual({
				name: 'session',
				value: 'abc123',
				httpOnly: true,
				secure: true,
				sameSite: 'Strict',
				maxAge: 3600,
				path: '/',
				domain: 'example.com',
			})
			expect(result.data).toEqual({ success: true })
		})

		test('should delete a cookie', async () => {
			const testAction = action(
				{
					name: 'deleteCookie',
					input: t.Object({}),
					output: t.Object({ success: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ success: true },
						{
							cookies: [
								{
									name: 'session',
									value: '',
									maxAge: 0,
								},
							],
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('deleteCookie')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.cookies?.[0].maxAge).toBe(0)
			expect(result.data).toEqual({ success: true })
		})
	})

	describe('combined metadata', () => {
		test('should combine status, headers, and cookies', async () => {
			const testAction = action(
				{
					name: 'combined',
					input: t.Object({}),
					output: t.Object({ user: t.String() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ user: 'john' },
						{
							status: 200,
							headers: {
								'X-User-ID': '123',
								'Cache-Control': 'private',
							},
							cookies: [{ name: 'session', value: 'abc', httpOnly: true }],
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('combined')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta).toEqual({
				status: 200,
				headers: {
					'X-User-ID': '123',
					'Cache-Control': 'private',
				},
				cookies: [{ name: 'session', value: 'abc', httpOnly: true }],
			})
			expect(result.data).toEqual({ user: 'john' })
		})
	})

	describe('data types', () => {
		test('should work with primitive data', async () => {
			const testAction = action(
				{
					name: 'primitiveData',
					input: t.Object({}),
					output: t.Object({ count: t.Number() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({ count: 42 }, { status: 200 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('primitiveData')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.data).toEqual({ count: 42 })
			expect(result.transportMeta?.status).toBe(200)
		})

		test('should work with nested objects', async () => {
			const testAction = action(
				{
					name: 'nestedData',
					input: t.Object({}),
					output: t.Object({
						user: t.Object({
							name: t.String(),
							profile: t.Object({
								age: t.Number(),
							}),
						}),
					}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{
							user: {
								name: 'John',
								profile: { age: 30 },
							},
						},
						{ status: 200 },
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('nestedData')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.data).toEqual({
				user: {
					name: 'John',
					profile: { age: 30 },
				},
			})
			expect(result.transportMeta?.status).toBe(200)
		})

		test('should work with arrays', async () => {
			const testAction = action(
				{
					name: 'arrayData',
					input: t.Object({}),
					output: t.Object({
						items: t.Array(t.String()),
					}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({ items: ['a', 'b', 'c'] }, { status: 200 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('arrayData')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.data).toEqual({ items: ['a', 'b', 'c'] })
			expect(result.transportMeta?.status).toBe(200)
		})

		test('should work with null values', async () => {
			const testAction = action(
				{
					name: 'nullData',
					input: t.Object({}),
					output: t.Object({
						value: t.Union([t.String(), t.Null()]),
					}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({ value: null }, { status: 200 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('nullData')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.data).toEqual({ value: null })
			expect(result.transportMeta?.status).toBe(200)
		})
	})

	describe('edge cases', () => {
		test('should handle empty data object', async () => {
			const testAction = action(
				{
					name: 'emptyData',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta({}, { status: 204 })
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('emptyData')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.data).toEqual({})
			expect(result.transportMeta).toEqual({ status: 204 })
		})

		test('should not override existing _meta in data', async () => {
			const testAction = action(
				{
					name: 'existingMeta',
					input: t.Object({}),
					output: t.Object({
						value: t.String(),
					}),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ value: 'test', _meta: { custom: 'old' } } as any,
						{ status: 200 },
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('existingMeta')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			// The new _meta should override any existing _meta in data
			expect(result.data).toEqual({ value: 'test' })
			expect(result.transportMeta).toEqual({ status: 200 })
		})

		test('should handle very long header values', async () => {
			const longValue = 'x'.repeat(1000)
			const testAction = action(
				{
					name: 'longHeader',
					input: t.Object({}),
					output: t.Object({ success: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ success: true },
						{ headers: { 'X-Long-Header': longValue } },
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('longHeader')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.headers?.['X-Long-Header']).toBe(longValue)
			expect(result.data).toEqual({ success: true })
		})

		test('should handle special characters in cookie values', async () => {
			const testAction = action(
				{
					name: 'specialCookie',
					input: t.Object({}),
					output: t.Object({ success: t.Boolean() }),
					triggers: [],
				},
				async (_input, ctx) => {
					return ctx.withMeta(
						{ success: true },
						{
							cookies: [
								{
									name: 'data',
									value: 'value with spaces and=special&chars',
								},
							],
						},
					)
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('specialCookie')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.transportMeta?.cookies?.[0].value).toBe(
				'value with spaces and=special&chars',
			)
		})
	})
})
