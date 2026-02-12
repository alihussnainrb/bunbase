import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from '../src'
import { action } from '../src/core/action.ts'
import { module } from '../src/core/module.ts'
import { ActionRegistry } from '../src/core/registry.ts'
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

describe('executeAction()', () => {
	let registry: ActionRegistry
	let mockWriteBuffer: WriteBuffer
	let mockLogger: ReturnType<typeof createMockLogger>

	beforeEach(() => {
		registry = new ActionRegistry()
		mockWriteBuffer = createMockWriteBuffer()
		mockLogger = createMockLogger()
	})

	it('should execute action successfully and return data', async () => {
		const testAction = action(
			{
				name: 'testSuccess',
				input: t.Object({ name: t.String() }),
				output: t.Object({ message: t.String() }),
				triggers: [],
			},
			async (input) => {
				return { message: `Hello, ${input.name}` }
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testSuccess')!

		const result = await executeAction(
			registered,
			{ name: 'World' },
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
			},
		)

		expect(result.success).toBe(true)
		expect(result.data).toEqual({ message: 'Hello, World' })
	})

	it('should run guards in sequence before handler', async () => {
		const guardOrder: string[] = []

		const guard1 = async () => {
			guardOrder.push('guard1')
		}
		const guard2 = async () => {
			guardOrder.push('guard2')
		}

		const testAction = action(
			{
				name: 'testGuards',
				input: t.Object({}),
				output: t.Object({ success: t.Boolean() }),
				triggers: [],
				guards: [guard1, guard2],
			},
			async () => {
				guardOrder.push('handler')
				return { success: true }
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testGuards')!

		await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
			},
		)

		expect(guardOrder).toEqual(['guard1', 'guard2', 'handler'])
	})

	it('should stop execution when guard throws', async () => {
		const guardError = new Error('Guard failed')
		const failingGuard = async () => {
			throw guardError
		}
		const handler = async () => ({ success: true })

		const testAction = action(
			{
				name: 'testGuardFail',
				input: t.Object({}),
				output: t.Object({ success: t.Boolean() }),
				triggers: [],
				guards: [failingGuard],
			},
			handler,
		)

		registry.registerAction(testAction)
		const registered = registry.get('testGuardFail')!

		const result = await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
			},
		)

		expect(result.success).toBe(false)
		expect(result.error).toBe('Guard failed')
	})

	it('should provide context with traceId, logger, and event', async () => {
		let capturedContext: any

		const testAction = action(
			{
				name: 'testContext',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async (_input, ctx) => {
				capturedContext = ctx
				return {}
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testContext')!

		await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
			},
		)

		expect(capturedContext.traceId).toBeDefined()
		expect(typeof capturedContext.traceId).toBe('string')
		expect(capturedContext.logger).toBeDefined()
		expect(typeof capturedContext.event.emit).toBe('function')
	})

	it('should pass auth context through to handler', async () => {
		let capturedAuth: any

		const testAction = action(
			{
				name: 'testAuthContext',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async (_input, ctx) => {
				capturedAuth = ctx.auth
				return {}
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testAuthContext')!

		const authContext = {
			userId: 'user-123',
			role: 'admin',
			permissions: ['read', 'write'],
		}

		await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
				auth: authContext,
			},
		)

		expect(capturedAuth).toEqual(authContext)
	})

	it('should handle handler errors gracefully', async () => {
		const testAction = action(
			{
				name: 'testHandlerError',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async () => {
				throw new Error('Handler failed')
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testHandlerError')!

		const result = await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
			},
		)

		expect(result.success).toBe(false)
		expect(result.error).toBe('Handler failed')
	})

	it('should include module context when action is in module', async () => {
		let capturedContext: any

		const testAction = action(
			{
				name: 'testModuleContext',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async (_input, ctx) => {
				capturedContext = ctx
				return {}
			},
		)

		const testModule = module({
			name: 'testModule',
			guards: [],
			actions: [testAction],
		})

		registry.registerModule(testModule)
		const registered = registry.get('testModuleContext')!

		await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockWriteBuffer,
			},
		)

		expect(capturedContext.module?.name).toBe('testModule')
	})

	it('should write run entry on success', async () => {
		const pushRunCalls: any[] = []
		const mockBuffer = {
			...mockWriteBuffer,
			pushRun: (entry: any) => {
				pushRunCalls.push(entry)
			},
		}

		const testAction = action(
			{
				name: 'testRunEntry',
				input: t.Object({ value: t.Number() }),
				output: t.Object({ doubled: t.Number() }),
				triggers: [],
			},
			async (input) => {
				return { doubled: input.value * 2 }
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testRunEntry')!

		await executeAction(
			registered,
			{ value: 5 },
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockBuffer as any,
			},
		)

		expect(pushRunCalls).toHaveLength(1)
		expect(pushRunCalls[0].action_name).toBe('testRunEntry')
		expect(pushRunCalls[0].status).toBe('success')
		expect(pushRunCalls[0].input).toContain('5')
		expect(pushRunCalls[0].output).toContain('10')
	})

	it('should write run entry on failure', async () => {
		const pushRunCalls: any[] = []
		const mockBuffer = {
			...mockWriteBuffer,
			pushRun: (entry: any) => {
				pushRunCalls.push(entry)
			},
		}

		const testAction = action(
			{
				name: 'testRunEntryFail',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async () => {
				throw new Error('Expected failure')
			},
		)

		registry.registerAction(testAction)
		const registered = registry.get('testRunEntryFail')!

		await executeAction(
			registered,
			{},
			{
				triggerType: 'api',
				logger: mockLogger as any,
				writeBuffer: mockBuffer as any,
			},
		)

		expect(pushRunCalls).toHaveLength(1)
		expect(pushRunCalls[0].status).toBe('error')
		expect(pushRunCalls[0].error).toBe('Expected failure')
	})

	describe('retry support', () => {
		it('should retry handler on retryable error up to maxAttempts', async () => {
			let callCount = 0
			const testAction = action(
				{
					name: 'testRetry',
					input: t.Object({}),
					output: t.Object({ ok: t.Boolean() }),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					callCount++
					if (callCount < 3) {
						throw new Error('Transient failure')
					}
					return { ok: true }
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testRetry')!

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
			expect(result.data).toEqual({ ok: true })
			expect(callCount).toBe(3)
		})

		it('should not retry NonRetriableError', async () => {
			let callCount = 0
			const { NonRetriableError } = await import('../src/utils/errors.ts')

			const testAction = action(
				{
					name: 'testNoRetryNonRetriable',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					callCount++
					throw new NonRetriableError('Bad input data')
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testNoRetryNonRetriable')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(false)
			expect(callCount).toBe(1)
		})

		it('should not retry BunbaseError with statusCode < 500', async () => {
			let callCount = 0
			const { NotFound } = await import('../src/utils/errors.ts')

			const testAction = action(
				{
					name: 'testNoRetryClientError',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					callCount++
					throw new NotFound('Resource not found')
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testNoRetryClientError')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(false)
			expect(callCount).toBe(1)
		})

		it('should retry BunbaseError with statusCode >= 500', async () => {
			let callCount = 0
			const { ServiceUnavailable } = await import('../src/utils/errors.ts')

			const testAction = action(
				{
					name: 'testRetryServerError',
					input: t.Object({}),
					output: t.Object({ ok: t.Boolean() }),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					callCount++
					if (callCount < 2) {
						throw new ServiceUnavailable('DB is down')
					}
					return { ok: true }
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testRetryServerError')!

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
			expect(callCount).toBe(2)
		})

		it('should fail after exhausting all retries', async () => {
			let callCount = 0

			const testAction = action(
				{
					name: 'testExhaustedRetries',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					callCount++
					throw new Error('Always fails')
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testExhaustedRetries')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Always fails')
			expect(callCount).toBe(3)
		})

		it('should respect retryIf custom predicate', async () => {
			let callCount = 0

			const testAction = action(
				{
					name: 'testRetryIf',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
					retry: {
						maxAttempts: 5,
						backoffMs: 10,
						retryIf: (err) => err.message.includes('transient'),
					},
				},
				async () => {
					callCount++
					if (callCount === 1) {
						throw new Error('transient failure')
					}
					throw new Error('permanent failure')
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testRetryIf')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(false)
			expect(result.error).toBe('permanent failure')
			expect(callCount).toBe(2)
		})

		it('should provide attempt info on ctx.retry', async () => {
			const attempts: number[] = []

			const testAction = action(
				{
					name: 'testCtxRetry',
					input: t.Object({}),
					output: t.Object({ ok: t.Boolean() }),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async (_input, ctx) => {
					attempts.push(ctx.retry.attempt)
					if (ctx.retry.attempt < 3) {
						throw new Error('Fail')
					}
					return { ok: true }
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testCtxRetry')!

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
			expect(attempts).toEqual([1, 2, 3])
		})

		it('should record run entries for each attempt', async () => {
			const pushRunCalls: any[] = []
			const mockBuffer = {
				...mockWriteBuffer,
				pushRun: (entry: any) => {
					pushRunCalls.push(entry)
				},
			}

			let callCount = 0
			const testAction = action(
				{
					name: 'testRunEntryRetries',
					input: t.Object({}),
					output: t.Object({ ok: t.Boolean() }),
					triggers: [],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					callCount++
					if (callCount < 3) {
						throw new Error('Transient failure')
					}
					return { ok: true }
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testRunEntryRetries')!

			await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockBuffer as any,
				},
			)

			// 2 failed attempts + 1 success = 3 run entries
			expect(pushRunCalls).toHaveLength(3)
			expect(pushRunCalls[0].status).toBe('error')
			expect(pushRunCalls[0].attempt).toBe(1)
			expect(pushRunCalls[1].status).toBe('error')
			expect(pushRunCalls[1].attempt).toBe(2)
			expect(pushRunCalls[2].status).toBe('success')
			expect(pushRunCalls[2].attempt).toBe(3)
		})

		it('should not retry when maxAttempts is 1 (default)', async () => {
			let callCount = 0

			const testAction = action(
				{
					name: 'testNoRetryDefault',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
				},
				async () => {
					callCount++
					throw new Error('Failure')
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testNoRetryDefault')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(false)
			expect(callCount).toBe(1)
		})

		it('should not retry guards — only handler', async () => {
			let guardCallCount = 0
			let handlerCallCount = 0

			const failingGuard = async () => {
				guardCallCount++
				throw new Error('Guard block')
			}

			const testAction = action(
				{
					name: 'testGuardNoRetry',
					input: t.Object({}),
					output: t.Object({}),
					triggers: [],
					guards: [failingGuard],
					retry: { maxAttempts: 3, backoffMs: 10 },
				},
				async () => {
					handlerCallCount++
					return {}
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testGuardNoRetry')!

			const result = await executeAction(
				registered,
				{},
				{
					triggerType: 'api',
					logger: mockLogger as any,
					writeBuffer: mockWriteBuffer,
				},
			)

			expect(result.success).toBe(false)
			expect(guardCallCount).toBe(1)
			expect(handlerCallCount).toBe(0)
		})

		it('should use fixed backoff when configured', async () => {
			let callCount = 0
			const timestamps: number[] = []

			const testAction = action(
				{
					name: 'testFixedBackoff',
					input: t.Object({}),
					output: t.Object({ ok: t.Boolean() }),
					triggers: [],
					retry: { maxAttempts: 3, backoff: 'fixed', backoffMs: 50 },
				},
				async () => {
					timestamps.push(Date.now())
					callCount++
					if (callCount < 3) {
						throw new Error('Fail')
					}
					return { ok: true }
				},
			)

			registry.registerAction(testAction)
			const registered = registry.get('testFixedBackoff')!

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
			expect(callCount).toBe(3)

			// Verify delays are roughly consistent (fixed backoff)
			const delay1 = timestamps[1]! - timestamps[0]!
			const delay2 = timestamps[2]! - timestamps[1]!
			expect(delay1).toBeGreaterThanOrEqual(40)
			expect(delay2).toBeGreaterThanOrEqual(40)
			// Both delays should be similar (fixed, not exponential)
			expect(Math.abs(delay1 - delay2)).toBeLessThan(30)
		})
	})
})

// ── isRetryable() tests ─────────────────────────────────

import { ActionValidationError } from '../src/core/action.ts'
import { GuardError } from '../src/core/guards/types.ts'
import {
	BadRequest,
	InternalError,
	isRetryable,
	NonRetriableError,
	NotFound,
	ServiceUnavailable,
} from '../src/utils/errors.ts'

describe('isRetryable()', () => {
	it('should return false for NonRetriableError', () => {
		expect(isRetryable(new NonRetriableError())).toBe(false)
	})

	it('should return false for client errors (< 500)', () => {
		expect(isRetryable(new BadRequest())).toBe(false)
		expect(isRetryable(new NotFound())).toBe(false)
	})

	it('should return true for server errors (>= 500)', () => {
		expect(isRetryable(new InternalError())).toBe(true)
		expect(isRetryable(new ServiceUnavailable())).toBe(true)
	})

	it('should return false for GuardError', () => {
		expect(isRetryable(new GuardError('Unauthorized', 401))).toBe(false)
	})

	it('should return false for ActionValidationError', () => {
		expect(isRetryable(new ActionValidationError('input', 'bad', []))).toBe(
			false,
		)
	})

	it('should return true for generic Error', () => {
		expect(isRetryable(new Error('something broke'))).toBe(true)
	})

	it('should return false for non-Error values', () => {
		expect(isRetryable('string error')).toBe(false)
		expect(isRetryable(null)).toBe(false)
		expect(isRetryable(42)).toBe(false)
	})
})
