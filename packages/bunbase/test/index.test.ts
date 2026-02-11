import { describe, expect, it } from 'bun:test'
import { action, module, triggers, guards, t } from '../src/index.ts'

describe('bunbase public exports', () => {
	it('should export action function', () => {
		expect(typeof action).toBe('function')
	})

	it('should export module function', () => {
		expect(typeof module).toBe('function')
	})

	it('should export triggers object', () => {
		expect(typeof triggers).toBe('object')
		expect(typeof triggers.api).toBe('function')
		expect(typeof triggers.event).toBe('function')
		expect(typeof triggers.cron).toBe('function')
		expect(typeof triggers.tool).toBe('function')
		expect(typeof triggers.webhook).toBe('function')
	})

	it('should export guards object', () => {
		expect(typeof guards).toBe('object')
		expect(typeof guards.authenticated).toBe('function')
		expect(typeof guards.hasRole).toBe('function')
		expect(typeof guards.hasPermission).toBe('function')
		expect(typeof guards.rateLimit).toBe('function')
		expect(typeof guards.inOrg).toBe('function')
		expect(typeof guards.hasFeature).toBe('function')
		expect(typeof guards.trialActiveOrPaid).toBe('function')
	})

	it('should export t from typebox', () => {
		expect(typeof t).toBe('object')
		expect(typeof t.String).toBe('function')
		expect(typeof t.Number).toBe('function')
		expect(typeof t.Object).toBe('function')
	})

	it('should allow creating a basic action with exported functions', () => {
		const testAction = action({
			name: 'exportedTest',
			input: t.Object({ name: t.String() }),
			output: t.Object({ greeting: t.String() }),
			triggers: [triggers.api('GET', '/test')],
		}, async (input) => {
			return { greeting: `Hello, ${input.name}` }
		})

		expect(testAction.config.name).toBe('exportedTest')
		expect(testAction.config.triggers).toHaveLength(1)
	})
})
