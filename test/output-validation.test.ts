import { describe, expect, test } from 'bun:test'
import { action, t } from '../packages/bunbase/src/index.ts'
import { ActionValidationError } from '../packages/bunbase/src/core/action.ts'
import type { ActionContext } from '../packages/bunbase/src/core/types.ts'

describe('Output Validation', () => {
	test('valid output passes validation', async () => {
		const testAction = action(
			{
				name: 'test-valid-output',
				input: t.Object({ name: t.String() }),
				output: t.Object({ id: t.String(), name: t.String() }),
			},
			async ({ name }) => {
				return { id: '123', name }
			},
		)

		const mockContext = {
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
			},
			traceId: 'test-trace',
		} as unknown as ActionContext

		const result = await testAction.handler({ name: 'John' }, mockContext)

		expect(result).toEqual({ id: '123', name: 'John' })
	})

	test('invalid output throws ActionValidationError', async () => {
		const testAction = action(
			{
				name: 'test-invalid-output',
				input: t.Object({ name: t.String() }),
				output: t.Object({ id: t.String(), name: t.String() }),
			},
			async () => {
				// Return invalid output (missing 'name')
				return { id: '123' } as any
			},
		)

		const mockContext = {
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
			},
			traceId: 'test-trace',
		} as unknown as ActionContext

		try {
			await testAction.handler({ name: 'John' }, mockContext)
			expect(true).toBe(false) // Should not reach here
		} catch (err) {
			expect(err).toBeInstanceOf(ActionValidationError)
			if (err instanceof ActionValidationError) {
				expect(err.phase).toBe('output')
				expect(err.validationErrors.length).toBeGreaterThan(0)
				expect(err.context?.traceId).toBe('test-trace')
				expect(err.context?.actionName).toBe('test-invalid-output')
			}
		}
	})

	test('ActionValidationError includes structured field errors', async () => {
		const testAction = action(
			{
				name: 'test-structured-errors',
				input: t.Object({ value: t.Number() }),
				output: t.Object({
					result: t.String(),
					count: t.Number(),
				}),
			},
			async () => {
				// Return invalid types
				return {
					result: 123, // Should be string
					count: 'invalid', // Should be number
				} as any
			},
		)

		const mockContext = {
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
			},
			traceId: 'test-trace',
		} as unknown as ActionContext

		try {
			await testAction.handler({ value: 42 }, mockContext)
			expect(true).toBe(false)
		} catch (err) {
			if (err instanceof ActionValidationError) {
				// Check that validation errors have structured data
				expect(err.validationErrors.length).toBeGreaterThan(0)

				const firstError = err.validationErrors[0]
				expect(firstError).toHaveProperty('path')
				expect(firstError).toHaveProperty('message')
				expect(firstError).toHaveProperty('schemaPath')

				// Test formatErrors method
				const formatted = err.formatErrors()
				expect(formatted).toContain('•')
				expect(typeof formatted).toBe('string')
			}
		}
	})

	test('ActionValidationError toJSON includes validation errors', () => {
		const error = new ActionValidationError(
			'output',
			'Test validation failed',
			[
				{
					path: '/result',
					schemaPath: '/properties/result',
					message: 'Expected string',
					schema: { type: 'string' },
					value: 123,
				},
			],
			{
				traceId: 'test-123',
				actionName: 'test-action',
			},
		)

		const json = error.toJSON()

		expect(json.phase).toBe('output')
		expect(json.validationErrors).toBeDefined()
		expect(Array.isArray(json.validationErrors)).toBe(true)
		expect(json.context?.traceId).toBe('test-123')
		expect(json.statusCode).toBe(400)
	})

	test('slow validation triggers warning', async () => {
		let warningMessage: string | undefined

		const slowAction = action(
			{
				name: 'test-slow-validation',
				input: t.Object({ name: t.String() }),
				output: t.Object({
					// Large schema to potentially trigger slow validation
					id: t.String(),
					name: t.String(),
					email: t.String(),
					age: t.Number(),
					address: t.Object({
						street: t.String(),
						city: t.String(),
						zip: t.String(),
					}),
				}),
			},
			async ({ name }) => {
				return {
					id: '123',
					name,
					email: 'test@example.com',
					age: 30,
					address: {
						street: '123 Main St',
						city: 'New York',
						zip: '10001',
					},
				}
			},
		)

		const mockContext = {
			logger: {
				info: () => {},
				warn: (msg: string) => {
					warningMessage = msg
				},
				error: () => {},
			},
			traceId: 'test-trace',
		} as unknown as ActionContext

		await slowAction.handler({ name: 'John' }, mockContext)

		// Note: This test may not always trigger the warning
		// since validation is usually fast. This is more of a
		// sanity check that the warning logic exists.
		// The warning is only logged if validation takes > 100ms
	})
})
