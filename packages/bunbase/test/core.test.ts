import { describe, expect, it } from 'bun:test'
import { t } from '../src'
import { action } from '../src/core/action.ts'
import { module } from '../src/core/module.ts'
import { ActionRegistry } from '../src/core/registry.ts'
import { triggers } from '../src/core/triggers/index.ts'

describe('action()', () => {
	it('should create an action definition with config and handler', () => {
		const testAction = action(
			{
				name: 'testAction',
				description: 'A test action',
				input: t.Object({ name: t.String() }),
				output: t.Object({ greeting: t.String() }),
				triggers: [],
			},
			async (input) => {
				return { greeting: `Hello ${input.name}` }
			},
		)

		expect(testAction.config.name).toBe('testAction')
		expect(testAction.config.description).toBe('A test action')
		expect(typeof testAction.handler).toBe('function')
	})

	it('should validate input and return correct output', async () => {
		const testAction = action(
			{
				name: 'validateTest',
				input: t.Object({
					email: t.String({ format: 'email' }),
					age: t.Number({ minimum: 0 }),
				}),
				output: t.Object({
					id: t.String(),
					email: t.String(),
				}),
				triggers: [],
			},
			async (input) => {
				return { id: '123', email: input.email }
			},
		)

		const mockCtx = {
			db: {} as any,
			storage: {} as any,
			kv: {} as any,
			logger: {
				info: () => {},
				error: () => {},
				debug: () => {},
				child: () => ({ info: () => {}, error: () => {}, debug: () => {} }),
			} as any,
			traceId: 'test-trace',
			event: { emit: () => {} },
			auth: {},
		}

		const result = await testAction.handler(
			{ email: 'test@example.com', age: 25 },
			mockCtx as any,
		)

		expect(result).toEqual({ id: '123', email: 'test@example.com' })
	})

	it('should throw on invalid input', async () => {
		const testAction = action(
			{
				name: 'validationTest',
				input: t.Object({ name: t.String({ minLength: 1 }) }),
				output: t.Object({ success: t.Boolean() }),
				triggers: [],
			},
			async () => {
				return { success: true }
			},
		)

		const mockCtx = {
			db: {} as any,
			storage: {} as any,
			kv: {} as any,
			logger: {
				info: () => {},
				error: () => {},
				debug: () => {},
				child: () => ({ info: () => {}, error: () => {}, debug: () => {} }),
			} as any,
			traceId: 'test-trace',
			event: { emit: () => {} },
			auth: {},
		}

		let errorThrown = false
		try {
			await testAction.handler({ name: '' }, mockCtx as any)
		} catch (err) {
			errorThrown = true
			expect((err as Error).message).toContain('validation')
		}

		expect(errorThrown).toBe(true)
	})

	it('should throw on invalid output', async () => {
		const testAction = action(
			{
				name: 'outputValidationTest',
				input: t.Object({ name: t.String() }),
				output: t.Object({ id: t.String(), count: t.Number() }),
				triggers: [],
			},
			async () => {
				// Return invalid output (missing count)
				return { id: '123' } as any
			},
		)

		const mockCtx = {
			db: {} as any,
			storage: {} as any,
			kv: {} as any,
			logger: {
				info: () => {},
				error: () => {},
				debug: () => {},
				child: () => ({ info: () => {}, error: () => {}, debug: () => {} }),
			} as any,
			traceId: 'test-trace',
			event: { emit: () => {} },
			auth: {},
		}

		let errorThrown = false
		try {
			await testAction.handler({ name: 'test' }, mockCtx as any)
		} catch (err) {
			errorThrown = true
			expect((err as Error).message).toContain('output')
		}

		expect(errorThrown).toBe(true)
	})
})

describe('module()', () => {
	it('should create a module definition', () => {
		const testModule = module({
			name: 'testModule',
			description: 'A test module',
			apiPrefix: '/test',
			guards: [],
			actions: [],
		})

		expect(testModule.config.name).toBe('testModule')
		expect(testModule.config.apiPrefix).toBe('/test')
	})
})

describe('ActionRegistry', () => {
	it('should register standalone actions', () => {
		const registry = new ActionRegistry()

		const testAction = action(
			{
				name: 'standaloneAction',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [triggers.api('GET', '/test')],
			},
			async () => ({}),
		)

		registry.registerAction(testAction)

		expect(registry.size).toBe(1)
		expect(registry.get('standaloneAction')).toBeDefined()
	})

	it('should throw on duplicate action names', () => {
		const registry = new ActionRegistry()

		const testAction = action(
			{
				name: 'duplicateAction',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async () => ({}),
		)

		registry.registerAction(testAction)

		expect(() => registry.registerAction(testAction)).toThrow(
			'already registered',
		)
	})

	it('should register module actions with prefixed routes', () => {
		const registry = new ActionRegistry()

		const testAction = action(
			{
				name: 'moduleAction',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [triggers.api('GET', '/items')],
			},
			async () => ({}),
		)

		const testModule = module({
			name: 'testModule',
			apiPrefix: '/api/v1',
			guards: [],
			actions: [testAction],
		})

		registry.registerModule(testModule)

		const registered = registry.get('moduleAction')
		expect(registered).toBeDefined()
		expect(registered?.triggers[0].path).toBe('/api/v1/items')
	})

	it('should merge module guards before action guards', () => {
		const registry = new ActionRegistry()

		const moduleGuard = async () => {}
		const actionGuard = async () => {}

		const testAction = action(
			{
				name: 'guardedAction',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
				guards: [actionGuard],
			},
			async () => ({}),
		)

		const testModule = module({
			name: 'guardedModule',
			guards: [moduleGuard],
			actions: [testAction],
		})

		registry.registerModule(testModule)

		const registered = registry.get('guardedAction')
		expect(registered?.guards).toHaveLength(2)
		expect(registered?.guards[0]).toBe(moduleGuard)
		expect(registered?.guards[1]).toBe(actionGuard)
	})

	it('should return all registered actions', () => {
		const registry = new ActionRegistry()

		const action1 = action(
			{
				name: 'action1',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async () => ({}),
		)
		const action2 = action(
			{
				name: 'action2',
				input: t.Object({}),
				output: t.Object({}),
				triggers: [],
			},
			async () => ({}),
		)

		registry.registerAction(action1)
		registry.registerAction(action2)

		const all = registry.getAll()
		expect(all).toHaveLength(2)
	})
})
