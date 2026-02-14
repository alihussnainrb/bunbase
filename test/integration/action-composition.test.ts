import { describe, expect, test, afterEach } from 'bun:test'
import { action, t } from '../../packages/bunbase/src/index.ts'
import { executeAction } from '../../packages/bunbase/src/runtime/executor.ts'
import {
	createTestEnv,
	cleanupTestEnv,
	cleanupTestData,
	createTestContext,
} from './setup.ts'

describe('Integration: Action Composition', () => {
	const env = createTestEnv()

	afterEach(async () => {
		await cleanupTestData(env)
		env.registry.clear()
	})

	afterEach(async () => {
		await cleanupTestEnv(env)
	})

	test('action can call another action via ctx.action()', async () => {
		// Define a helper action
		const addNumbers = action(
			{
				name: 'addNumbers',
				input: t.Object({ a: t.Number(), b: t.Number() }),
				output: t.Object({ sum: t.Number() }),
			},
			async ({ a, b }) => {
				return { sum: a + b }
			},
		)

		// Define a main action that calls the helper
		const calculate = action(
			{
				name: 'calculate',
				input: t.Object({ x: t.Number(), y: t.Number(), z: t.Number() }),
				output: t.Object({ result: t.Number() }),
			},
			async ({ x, y, z }, ctx) => {
				// Call addNumbers twice
				const step1 = await ctx.action('addNumbers', { a: x, b: y })
				const step2 = await ctx.action('addNumbers', { a: step1.sum, b: z })
				return { result: step2.sum }
			},
		)

		// Register both actions
		env.registry.registerAction(addNumbers)
		env.registry.registerAction(calculate)

		// Execute the main action
		const result = await executeAction(
			env.registry.get('calculate')!,
			{ x: 10, y: 20, z: 30 },
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
				registry: env.registry,
			},
		)

		expect(result.success).toBe(true)
		expect(result.data).toEqual({ result: 60 })
	})

	test('circular action calls are detected and prevented', async () => {
		// Action A calls B
		const actionA = action(
			{
				name: 'actionA',
				input: t.Object({}),
				output: t.Object({ value: t.String() }),
			},
			async (_, ctx) => {
				await ctx.action('actionB', {})
				return { value: 'A' }
			},
		)

		// Action B calls A (creates a cycle)
		const actionB = action(
			{
				name: 'actionB',
				input: t.Object({}),
				output: t.Object({ value: t.String() }),
			},
			async (_, ctx) => {
				await ctx.action('actionA', {})
				return { value: 'B' }
			},
		)

		env.registry.registerAction(actionA)
		env.registry.registerAction(actionB)

		// Execute action A (should detect cycle)
		const result = await executeAction(
			env.registry.get('actionA')!,
			{},
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
				registry: env.registry,
			},
		)

		expect(result.success).toBe(false)
		expect(result.error).toContain('Circular dependency detected')
	})

	test('deeply nested action calls work correctly', async () => {
		// Create a chain of 5 actions
		const increment = action(
			{
				name: 'increment',
				input: t.Object({ value: t.Number() }),
				output: t.Object({ value: t.Number() }),
			},
			async ({ value }) => {
				return { value: value + 1 }
			},
		)

		const double = action(
			{
				name: 'double',
				input: t.Object({ value: t.Number() }),
				output: t.Object({ value: t.Number() }),
			},
			async ({ value }, ctx) => {
				const result = await ctx.action('increment', { value })
				return { value: result.value * 2 }
			},
		)

		const addTen = action(
			{
				name: 'addTen',
				input: t.Object({ value: t.Number() }),
				output: t.Object({ value: t.Number() }),
			},
			async ({ value }, ctx) => {
				const result = await ctx.action('double', { value })
				return { value: result.value + 10 }
			},
		)

		env.registry.registerAction(increment)
		env.registry.registerAction(double)
		env.registry.registerAction(addTen)

		// Execute: addTen(5) -> double(5) -> increment(5) = 6, then 6 * 2 = 12, then 12 + 10 = 22
		const result = await executeAction(
			env.registry.get('addTen')!,
			{ value: 5 },
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
				registry: env.registry,
			},
		)

		expect(result.success).toBe(true)
		expect(result.data).toEqual({ value: 22 })
	})

	test('action composition preserves auth context', async () => {
		const getUserId = action(
			{
				name: 'getUserId',
				input: t.Object({}),
				output: t.Object({ userId: t.String() }),
			},
			async (_, ctx) => {
				return { userId: ctx.auth.userId || 'anonymous' }
			},
		)

		const checkAuth = action(
			{
				name: 'checkAuth',
				input: t.Object({}),
				output: t.Object({ isAuthenticated: t.Boolean(), userId: t.String() }),
			},
			async (_, ctx) => {
				const result = await ctx.action('getUserId', {})
				return {
					isAuthenticated: ctx.auth.userId !== undefined,
					userId: result.userId,
				}
			},
		)

		env.registry.registerAction(getUserId)
		env.registry.registerAction(checkAuth)

		// Execute with auth context
		const result = await executeAction(
			env.registry.get('checkAuth')!,
			{},
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
				registry: env.registry,
				auth: {
					userId: 'user-123',
					role: 'admin',
				},
			},
		)

		expect(result.success).toBe(true)
		expect(result.data).toEqual({
			isAuthenticated: true,
			userId: 'user-123',
		})
	})

	test('errors in composed actions propagate correctly', async () => {
		const failingAction = action(
			{
				name: 'failingAction',
				input: t.Object({}),
				output: t.Object({ value: t.String() }),
			},
			async () => {
				throw new Error('Intentional failure')
			},
		)

		const callerAction = action(
			{
				name: 'callerAction',
				input: t.Object({}),
				output: t.Object({ value: t.String() }),
			},
			async (_, ctx) => {
				try {
					await ctx.action('failingAction', {})
					return { value: 'success' }
				} catch (err) {
					throw new Error(`Caught error: ${err instanceof Error ? err.message : String(err)}`)
				}
			},
		)

		env.registry.registerAction(failingAction)
		env.registry.registerAction(callerAction)

		const result = await executeAction(
			env.registry.get('callerAction')!,
			{},
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
				registry: env.registry,
			},
		)

		expect(result.success).toBe(false)
		expect(result.error).toContain('Caught error')
		expect(result.error).toContain('Intentional failure')
	})
})
