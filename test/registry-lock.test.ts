import { describe, expect, test } from 'bun:test'
import { ActionRegistry } from '../packages/bunbase/src/core/registry.ts'
import { action, t } from '../packages/bunbase/src/index.ts'

describe('Registry Locking', () => {
	describe('Lifecycle States', () => {
		test('registry starts in loading state', () => {
			const registry = new ActionRegistry()

			expect(registry.getState()).toBe('loading')
			expect(registry.isLocked()).toBe(false)
		})

		test('lock() transitions to locked state', () => {
			const registry = new ActionRegistry()

			registry.lock()

			expect(registry.getState()).toBe('locked')
			expect(registry.isLocked()).toBe(true)
		})

		test('lock() is idempotent', () => {
			const registry = new ActionRegistry()

			registry.lock()
			registry.lock() // Should not throw

			expect(registry.getState()).toBe('locked')
		})
	})

	describe('Lock Enforcement', () => {
		test('registerAction throws when locked', () => {
			const registry = new ActionRegistry()
			registry.lock()

			const testAction = action(
				{
					name: 'test-action',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)

			expect(() => registry.registerAction(testAction)).toThrow(
				'Registry is locked',
			)
		})

		test('registerModule throws when locked', () => {
			const registry = new ActionRegistry()
			registry.lock()

			const testModule = {
				config: {
					name: 'test-module',
					actions: [],
				},
			}

			expect(() => registry.registerModule(testModule as any)).toThrow(
				'Registry is locked',
			)
		})

		test('clear() throws when locked', () => {
			const registry = new ActionRegistry()
			registry.lock()

			expect(() => registry.clear()).toThrow('Registry is locked')
		})

		test('can still read from locked registry', () => {
			const registry = new ActionRegistry()

			const testAction = action(
				{
					name: 'test-action',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)

			registry.registerAction(testAction)
			registry.lock()

			// Read operations should still work
			expect(registry.get('test-action')).toBeDefined()
			expect(registry.size).toBe(1)
			expect(registry.getAll().length).toBe(1)
		})
	})

	describe('Reload Workflow', () => {
		test('beginReload transitions to reloading state', () => {
			const registry = new ActionRegistry()

			registry.beginReload()

			expect(registry.getState()).toBe('reloading')
		})

		test('beginReload takes snapshot and clears actions', () => {
			const registry = new ActionRegistry()

			const testAction = action(
				{
					name: 'test-action',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)

			registry.registerAction(testAction)
			expect(registry.size).toBe(1)

			registry.beginReload()

			// Actions should be cleared
			expect(registry.size).toBe(0)
			expect(registry.get('test-action')).toBeUndefined()
		})

		test('commitReload discards snapshot and returns to loading', () => {
			const registry = new ActionRegistry()

			registry.beginReload()
			registry.commitReload()

			expect(registry.getState()).toBe('loading')
		})

		test('rollbackReload restores from snapshot', () => {
			const registry = new ActionRegistry()

			const testAction = action(
				{
					name: 'original-action',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)

			registry.registerAction(testAction)
			expect(registry.size).toBe(1)

			// Begin reload (takes snapshot)
			registry.beginReload()
			expect(registry.size).toBe(0)

			// Try to add new action
			const newAction = action(
				{
					name: 'new-action',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)
			registry.registerAction(newAction)
			expect(registry.size).toBe(1)
			expect(registry.get('new-action')).toBeDefined()

			// Rollback
			registry.rollbackReload()

			// Should restore original state
			expect(registry.size).toBe(1)
			expect(registry.get('original-action')).toBeDefined()
			expect(registry.get('new-action')).toBeUndefined()
			expect(registry.getState()).toBe('loading')
		})

		test('beginReload throws when locked', () => {
			const registry = new ActionRegistry()

			registry.lock()

			expect(() => registry.beginReload()).toThrow(
				'Cannot reload in production mode',
			)
		})

		test('commitReload throws when not reloading', () => {
			const registry = new ActionRegistry()

			expect(() => registry.commitReload()).toThrow('No reload in progress')
		})

		test('rollbackReload throws when not reloading', () => {
			const registry = new ActionRegistry()

			expect(() => registry.rollbackReload()).toThrow('No reload in progress')
		})
	})

	describe('Reload Workflow Integration', () => {
		test('successful reload workflow', () => {
			const registry = new ActionRegistry()

			// Initial state
			const action1 = action(
				{
					name: 'action1',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)
			registry.registerAction(action1)
			expect(registry.size).toBe(1)

			// Begin reload
			registry.beginReload()
			expect(registry.getState()).toBe('reloading')
			expect(registry.size).toBe(0)

			// Load new actions
			const action2 = action(
				{
					name: 'action2',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)
			registry.registerAction(action2)

			// Commit
			registry.commitReload()
			expect(registry.getState()).toBe('loading')
			expect(registry.size).toBe(1)
			expect(registry.get('action2')).toBeDefined()
		})

		test('failed reload workflow with rollback', () => {
			const registry = new ActionRegistry()

			// Initial state
			const action1 = action(
				{
					name: 'action1',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)
			registry.registerAction(action1)

			// Begin reload
			registry.beginReload()

			// Simulate failure during reload
			try {
				throw new Error('Simulated reload failure')
			} catch {
				// Rollback on failure
				registry.rollbackReload()
			}

			// Should have original action back
			expect(registry.size).toBe(1)
			expect(registry.get('action1')).toBeDefined()
			expect(registry.getState()).toBe('loading')
		})

		test('multiple reload cycles', () => {
			const registry = new ActionRegistry()

			// Cycle 1
			registry.beginReload()
			const action1 = action(
				{
					name: 'action1',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)
			registry.registerAction(action1)
			registry.commitReload()

			// Cycle 2
			registry.beginReload()
			const action2 = action(
				{
					name: 'action2',
					input: t.Object({}),
					output: t.Object({}),
				},
				async () => ({}),
			)
			registry.registerAction(action2)
			registry.commitReload()

			// Should have latest action
			expect(registry.size).toBe(1)
			expect(registry.get('action2')).toBeDefined()
		})
	})
})
