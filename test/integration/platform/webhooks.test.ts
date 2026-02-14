/**
 * Integration tests for Webhooks module
 * Tests webhook management and event delivery
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { sql as createSql } from 'bun'
import type { SQL } from 'bun'
import { Logger } from '../../../packages/bunbase/src/logger/index.ts'
import { WebhookManager } from '../../../packages/bunbase/src/platform/webhooks/webhook-manager.ts'
import { WebhookDispatcher } from '../../../packages/bunbase/src/platform/webhooks/dispatcher.ts'
import type { UserId, OrgId } from '../../../packages/bunbase/src/platform/core/types.ts'

let sql: SQL
let logger: Logger
let webhookManager: WebhookManager
let dispatcher: WebhookDispatcher

// Test IDs
const userId1 = 'usr_webhook_test1' as UserId
const orgId1 = 'org_webhook_test1' as OrgId

// Mock webhook endpoint server
let mockServer: ReturnType<typeof Bun.serve> | null = null
let receivedEvents: Array<{
	headers: Record<string, string>
	body: unknown
}> = []

beforeAll(async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error('DATABASE_URL environment variable is required for integration tests')
	}

	sql = createSql(dbUrl)
	logger = new Logger()

	webhookManager = new WebhookManager(sql, logger)
	dispatcher = new WebhookDispatcher(sql, logger, 3) // 3 max attempts for faster tests

	// Create test users and orgs
	await sql`
		INSERT INTO users (id, email, password_hash, created_at)
		VALUES (${userId1}, 'webhook1@test.com', 'hash1', NOW())
		ON CONFLICT (id) DO NOTHING
	`

	await sql`
		INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
		VALUES (${orgId1}, 'Webhook Test Org', 'webhook-test-org', ${userId1}, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`

	// Start mock webhook server
	mockServer = Bun.serve({
		port: 9999,
		fetch(req) {
			const headers: Record<string, string> = {}
			req.headers.forEach((value, key) => {
				headers[key] = value
			})

			return req.json().then((body) => {
				receivedEvents.push({ headers, body })
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			})
		},
	})
})

afterAll(async () => {
	if (mockServer) {
		mockServer.stop()
	}
})

describe('WebhookManager', () => {
	test('create webhook for user', async () => {
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/webhook',
			events: ['user.created', 'user.updated'],
			secret: 'test-secret-123',
		})

		expect(webhook.id).toBeDefined()
		expect(webhook.userId).toBe(userId1)
		expect(webhook.orgId).toBeUndefined()
		expect(webhook.url).toBe('http://localhost:9999/webhook')
		expect(webhook.events).toEqual(['user.created', 'user.updated'])
		expect(webhook.enabled).toBe(true)
	})

	test('create webhook for organization', async () => {
		const webhook = await webhookManager.create({
			orgId: orgId1,
			url: 'http://localhost:9999/org-webhook',
			events: ['org.member.added', 'org.member.removed'],
			secret: 'test-org-secret-456',
		})

		expect(webhook.id).toBeDefined()
		expect(webhook.orgId).toBe(orgId1)
		expect(webhook.userId).toBeUndefined()
		expect(webhook.url).toBe('http://localhost:9999/org-webhook')
	})

	test('reject webhook with both userId and orgId', async () => {
		await expect(
			webhookManager.create({
				userId: userId1,
				orgId: orgId1,
				url: 'http://localhost:9999/invalid',
				events: ['test.event'],
				secret: 'secret',
			}),
		).rejects.toThrow('Either orgId or userId must be provided')
	})

	test('reject webhook with neither userId nor orgId', async () => {
		await expect(
			webhookManager.create({
				url: 'http://localhost:9999/invalid',
				events: ['test.event'],
				secret: 'secret',
			}),
		).rejects.toThrow('Either orgId or userId must be provided')
	})

	test('get webhook by ID', async () => {
		const created = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/test',
			events: ['test.event'],
			secret: 'secret',
		})

		const fetched = await webhookManager.get(created.id)

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
		expect(fetched?.url).toBe('http://localhost:9999/test')
	})

	test('update webhook URL', async () => {
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/old',
			events: ['test.event'],
			secret: 'secret',
		})

		const updated = await webhookManager.update(webhook.id, {
			url: 'http://localhost:9999/new',
		})

		expect(updated.url).toBe('http://localhost:9999/new')
	})

	test('update webhook events', async () => {
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/test',
			events: ['event.a'],
			secret: 'secret',
		})

		const updated = await webhookManager.update(webhook.id, {
			events: ['event.b', 'event.c'],
		})

		expect(updated.events).toEqual(['event.b', 'event.c'])
	})

	test('disable webhook', async () => {
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/test',
			events: ['test.event'],
			secret: 'secret',
		})

		await webhookManager.disable(webhook.id)

		const fetched = await webhookManager.get(webhook.id)

		expect(fetched?.enabled).toBe(false)
	})

	test('enable webhook', async () => {
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/test',
			events: ['test.event'],
			secret: 'secret',
		})

		await webhookManager.disable(webhook.id)
		await webhookManager.enable(webhook.id)

		const fetched = await webhookManager.get(webhook.id)

		expect(fetched?.enabled).toBe(true)
	})

	test('delete webhook', async () => {
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/test',
			events: ['test.event'],
			secret: 'secret',
		})

		await webhookManager.delete(webhook.id)

		const fetched = await webhookManager.get(webhook.id)

		expect(fetched).toBeNull()
	})

	test('list webhooks for user', async () => {
		const webhooks = await webhookManager.list({ userId: userId1 })

		expect(webhooks.length).toBeGreaterThan(0)
		expect(webhooks.every((w) => w.userId === userId1)).toBe(true)
	})

	test('list webhooks for org', async () => {
		const webhooks = await webhookManager.list({ orgId: orgId1 })

		expect(webhooks.length).toBeGreaterThan(0)
		expect(webhooks.every((w) => w.orgId === orgId1)).toBe(true)
	})

	test('list enabled webhooks only', async () => {
		const webhooks = await webhookManager.list({ enabled: true })

		expect(webhooks.every((w) => w.enabled)).toBe(true)
	})

	test('get webhooks for specific event', async () => {
		await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/test',
			events: ['specific.event'],
			secret: 'secret',
		})

		const webhooks = await webhookManager.getForEvent('specific.event', undefined, userId1)

		expect(webhooks.length).toBeGreaterThan(0)
		expect(webhooks.every((w) => w.events.includes('specific.event'))).toBe(true)
	})
})

describe('WebhookDispatcher', () => {
	test('dispatch event to subscribed webhooks', async () => {
		receivedEvents = [] // Clear previous events

		// Create webhook subscribed to 'test.dispatch'
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/dispatch-test',
			events: ['test.dispatch'],
			secret: 'dispatch-secret',
		})

		// Dispatch event
		const eventIds = await dispatcher.dispatch({
			eventName: 'test.dispatch',
			payload: { message: 'Test dispatch' },
			userId: userId1,
		})

		expect(eventIds.length).toBeGreaterThan(0)

		// Wait for delivery
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Check if event was received
		expect(receivedEvents.length).toBeGreaterThan(0)
		const received = receivedEvents.find((e) => e.body && (e.body as any).message === 'Test dispatch')
		expect(received).toBeDefined()
		expect(received?.headers['x-webhook-event']).toBe('test.dispatch')
		expect(received?.headers['x-webhook-signature']).toBeDefined()
	})

	test('do not dispatch to disabled webhooks', async () => {
		receivedEvents = []

		// Create disabled webhook
		const webhook = await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/disabled',
			events: ['test.disabled'],
			secret: 'secret',
		})

		await webhookManager.disable(webhook.id)

		// Dispatch event
		const eventIds = await dispatcher.dispatch({
			eventName: 'test.disabled',
			payload: { message: 'Should not receive' },
			userId: userId1,
		})

		expect(eventIds.length).toBe(0)
	})

	test('do not dispatch to webhooks not subscribed to event', async () => {
		receivedEvents = []

		// Create webhook subscribed to different event
		await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/different',
			events: ['different.event'],
			secret: 'secret',
		})

		// Dispatch event
		const eventIds = await dispatcher.dispatch({
			eventName: 'test.unsubscribed',
			payload: { message: 'Not subscribed' },
			userId: userId1,
		})

		expect(eventIds.length).toBe(0)
	})

	test('HMAC signature verification', async () => {
		receivedEvents = []

		const secret = 'test-signature-secret'

		await webhookManager.create({
			userId: userId1,
			url: 'http://localhost:9999/signature',
			events: ['test.signature'],
			secret,
		})

		await dispatcher.dispatch({
			eventName: 'test.signature',
			payload: { data: 'test' },
			userId: userId1,
		})

		await new Promise((resolve) => setTimeout(resolve, 100))

		const received = receivedEvents[receivedEvents.length - 1]
		expect(received?.headers['x-webhook-signature']).toBeDefined()

		// Verify signature matches
		const payload = JSON.stringify(received?.body)
		const encoder = new TextEncoder()
		const keyData = encoder.encode(secret)
		const messageData = encoder.encode(payload)

		const key = await crypto.subtle.importKey(
			'raw',
			keyData,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign'],
		)

		const signature = await crypto.subtle.sign('HMAC', key, messageData)
		const expectedSignature = Array.from(new Uint8Array(signature))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')

		expect(received?.headers['x-webhook-signature']).toBe(expectedSignature)
	})
})
