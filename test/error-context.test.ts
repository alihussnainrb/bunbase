import { describe, expect, test } from 'bun:test'
import {
	BunbaseError,
	BadRequest,
	Unauthorized,
	InternalError,
	type ErrorContext,
} from '../packages/bunbase/src/utils/errors.ts'

describe('Error Context', () => {
	describe('BunbaseError', () => {
		test('accepts context in constructor', () => {
			const context: ErrorContext = {
				traceId: 'trace-123',
				actionName: 'test-action',
				userId: 'user-456',
			}

			const error = new BunbaseError('Test error', 500, context)

			expect(error.context).toEqual(context)
			expect(error.context?.traceId).toBe('trace-123')
			expect(error.context?.actionName).toBe('test-action')
			expect(error.context?.userId).toBe('user-456')
		})

		test('withContext merges new context with existing', () => {
			const initialContext: ErrorContext = {
				traceId: 'trace-123',
				actionName: 'test-action',
			}

			const error = new BunbaseError('Test error', 500, initialContext)

			const enhancedError = error.withContext({
				userId: 'user-456',
				moduleName: 'auth',
			})

			expect(enhancedError.context).toEqual({
				traceId: 'trace-123',
				actionName: 'test-action',
				userId: 'user-456',
				moduleName: 'auth',
			})
		})

		test('withContext overwrites existing keys', () => {
			const error = new BunbaseError('Test error', 500, {
				traceId: 'old-trace',
				actionName: 'old-action',
			})

			const updated = error.withContext({
				traceId: 'new-trace',
			})

			expect(updated.context?.traceId).toBe('new-trace')
			expect(updated.context?.actionName).toBe('old-action')
		})

		test('toJSON includes all error properties', () => {
			const context: ErrorContext = {
				traceId: 'trace-123',
				actionName: 'test-action',
			}

			const error = new BunbaseError('Test error', 500, context)
			const json = error.toJSON()

			expect(json.name).toBe('BunbaseError')
			expect(json.message).toBe('Test error')
			expect(json.statusCode).toBe(500)
			expect(json.context).toEqual(context)
			expect(json.stack).toBeDefined()
		})

		test('toJSON works without context', () => {
			const error = new BunbaseError('Test error', 500)
			const json = error.toJSON()

			expect(json.name).toBe('BunbaseError')
			expect(json.message).toBe('Test error')
			expect(json.statusCode).toBe(500)
			expect(json.context).toBeUndefined()
		})
	})

	describe('Error Subclasses', () => {
		test('BadRequest accepts context', () => {
			const context: ErrorContext = { traceId: 'trace-123' }
			const error = new BadRequest('Invalid input', context)

			expect(error.statusCode).toBe(400)
			expect(error.context).toEqual(context)
		})

		test('Unauthorized accepts context', () => {
			const context: ErrorContext = { traceId: 'trace-123' }
			const error = new Unauthorized('Not logged in', context)

			expect(error.statusCode).toBe(401)
			expect(error.context).toEqual(context)
		})

		test('InternalError accepts context', () => {
			const context: ErrorContext = { traceId: 'trace-123' }
			const error = new InternalError('Server error', context)

			expect(error.statusCode).toBe(500)
			expect(error.context).toEqual(context)
		})

		test('subclass withContext preserves class type', () => {
			const error = new BadRequest('Test')
			const enhanced = error.withContext({ traceId: 'trace-123' })

			expect(enhanced).toBeInstanceOf(BadRequest)
			expect(enhanced.name).toBe('BadRequest')
			expect(enhanced.statusCode).toBe(400)
			expect(enhanced.context?.traceId).toBe('trace-123')
		})
	})

	describe('Context Propagation', () => {
		test('context can include custom properties', () => {
			const context: ErrorContext = {
				traceId: 'trace-123',
				actionName: 'test-action',
				customField: 'custom-value',
				nestedData: { foo: 'bar' },
			}

			const error = new BunbaseError('Test error', 500, context)

			expect(error.context?.customField).toBe('custom-value')
			expect(error.context?.nestedData).toEqual({ foo: 'bar' })
		})

		test('builder pattern allows chaining', () => {
			const error = new BadRequest('Test')
				.withContext({ traceId: 'trace-123' })
				.withContext({ userId: 'user-456' })
				.withContext({ moduleName: 'auth' })

			expect(error.context?.traceId).toBe('trace-123')
			expect(error.context?.userId).toBe('user-456')
			expect(error.context?.moduleName).toBe('auth')
		})

		test('empty context is handled correctly', () => {
			const error = new BunbaseError('Test error', 500, {})

			expect(error.context).toEqual({})
			expect(error.toJSON().context).toEqual({})
		})
	})
})
