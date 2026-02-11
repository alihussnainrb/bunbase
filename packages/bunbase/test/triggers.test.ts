import { describe, expect, it } from 'bun:test'
import { triggers } from '../src/core/triggers/index.ts'

describe('triggers.api()', () => {
	it('should create API trigger with method and path', () => {
		const trigger = triggers.api('POST', '/users')

		expect(trigger.type).toBe('api')
		expect(trigger.method).toBe('POST')
		expect(trigger.path).toBe('/users')
	})

	it('should create API trigger with custom map function', () => {
		const mapFn = (req: Request) => ({ custom: true })
		const trigger = triggers.api('GET', '/items', { map: mapFn })

		expect(trigger.type).toBe('api')
		expect(trigger.map).toBe(mapFn)
	})

	it('should support all HTTP methods', () => {
		const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

		for (const method of methods) {
			const trigger = triggers.api(method, '/test')
			expect(trigger.method).toBe(method)
		}
	})
})

describe('triggers.event()', () => {
	it('should create event trigger with event name', () => {
		const trigger = triggers.event('user.created')

		expect(trigger.type).toBe('event')
		expect(trigger.event).toBe('user.created')
	})

	it('should create event trigger with custom map', () => {
		const mapFn = (payload: unknown) => ({ mapped: payload })
		const trigger = triggers.event('order.placed', { map: mapFn })

		expect(trigger.map).toBe(mapFn)
	})
})

describe('triggers.cron()', () => {
	it('should create cron trigger with schedule', () => {
		const trigger = triggers.cron('0 2 * * *')

		expect(trigger.type).toBe('cron')
		expect(trigger.schedule).toBe('0 2 * * *')
	})

	it('should create cron trigger with static input', () => {
		const inputFn = () => ({ dryRun: true })
		const trigger = triggers.cron('*/5 * * * *', { input: inputFn })

		expect(trigger.input).toBe(inputFn)
	})
})

describe('triggers.tool()', () => {
	it('should create MCP tool trigger', () => {
		const trigger = triggers.tool({
			name: 'create_user',
			description: 'Create a new user',
		})

		expect(trigger.type).toBe('tool')
		expect(trigger.name).toBe('create_user')
		expect(trigger.description).toBe('Create a new user')
	})
})

describe('triggers.webhook()', () => {
	it('should create webhook trigger with path', () => {
		const trigger = triggers.webhook('/webhooks/stripe')

		expect(trigger.type).toBe('webhook')
		expect(trigger.path).toBe('/webhooks/stripe')
	})

	it('should create webhook trigger with verify and map', () => {
		const verifyFn = async (req: Request) => true
		const mapFn = (body: unknown) => ({ mapped: body })

		const trigger = triggers.webhook('/webhooks/github', {
			verify: verifyFn,
			map: mapFn,
		})

		expect(trigger.verify).toBe(verifyFn)
		expect(trigger.map).toBe(mapFn)
	})
})

describe('trigger type discrimination', () => {
	it('should properly discriminate trigger types', () => {
		const apiTrigger = triggers.api('GET', '/test')
		const eventTrigger = triggers.event('test')
		const cronTrigger = triggers.cron('* * * * *')
		const toolTrigger = triggers.tool({ name: 'test', description: 'Test' })
		const webhookTrigger = triggers.webhook('/webhook')

		// Type discrimination works via the 'type' property
		expect(apiTrigger.type).toBe('api')
		expect(eventTrigger.type).toBe('event')
		expect(cronTrigger.type).toBe('cron')
		expect(toolTrigger.type).toBe('tool')
		expect(webhookTrigger.type).toBe('webhook')
	})
})
