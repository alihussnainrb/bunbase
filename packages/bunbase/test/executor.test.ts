import { beforeEach, describe, expect, it } from 'bun:test'
import { t } from '../src'
import { action } from '../src/core/action.ts'
import { module } from '../src/core/module.ts'
import { ActionRegistry } from '../src/core/registry.ts'
import { guards } from '../src/core/guards/index.ts'
import type { WriteBuffer } from '../src/persistence/write-buffer.ts'
import { executeAction } from '../src/runtime/executor.ts'
import { triggers } from '../src/core/triggers/index.ts'

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
})
