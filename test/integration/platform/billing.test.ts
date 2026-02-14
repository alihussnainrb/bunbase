/**
 * Integration tests for Billing module
 * Tests plans and subscriptions
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { sql as createSql } from 'bun'
import type { SQL } from 'bun'
import { Logger } from '../../../packages/bunbase/src/logger/index.ts'
import { PlanManager } from '../../../packages/bunbase/src/platform/billing/plan-manager.ts'
import { SubscriptionManager } from '../../../packages/bunbase/src/platform/billing/subscription-manager.ts'
import type { UserId, OrgId } from '../../../packages/bunbase/src/platform/core/types.ts'
import { PlanNotFoundError, SubscriptionNotFoundError } from '../../../packages/bunbase/src/platform/core/errors.ts'

let sql: SQL
let logger: Logger
let planManager: PlanManager
let subscriptionManager: SubscriptionManager

// Test IDs
const userId1 = 'usr_billing_test1' as UserId
const orgId1 = 'org_billing_test1' as OrgId

beforeAll(async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error('DATABASE_URL environment variable is required for integration tests')
	}

	sql = createSql(dbUrl)
	logger = new Logger()

	planManager = new PlanManager(sql, logger)
	subscriptionManager = new SubscriptionManager(sql, logger)

	// Create test users and orgs
	await sql`
		INSERT INTO users (id, email, password_hash, created_at)
		VALUES (${userId1}, 'billing1@test.com', 'hash1', NOW())
		ON CONFLICT (id) DO NOTHING
	`

	await sql`
		INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
		VALUES (${orgId1}, 'Billing Test Org', 'billing-test-org', ${userId1}, NOW(), NOW())
		ON CONFLICT (id) DO NOTHING
	`
})

describe('PlanManager', () => {
	test('create plan', async () => {
		const plan = await planManager.create({
			key: 'test-plan',
			name: 'Test Plan',
			priceCents: 1999,
			description: 'A test plan',
		})

		expect(plan.id).toBeDefined()
		expect(plan.key).toBe('test-plan')
		expect(plan.name).toBe('Test Plan')
		expect(plan.priceCents).toBe(1999)
		expect(plan.description).toBe('A test plan')
	})

	test('get plan by ID', async () => {
		const created = await planManager.create({
			key: 'test-plan-fetch',
			name: 'Fetch Test Plan',
			priceCents: 2999,
		})

		const fetched = await planManager.get(created.id)

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
		expect(fetched?.key).toBe('test-plan-fetch')
	})

	test('get plan by key', async () => {
		const created = await planManager.create({
			key: 'test-plan-bykey',
			name: 'By Key Test Plan',
			priceCents: 3999,
		})

		const fetched = await planManager.getByKey('test-plan-bykey')

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
	})

	test('update plan', async () => {
		const plan = await planManager.create({
			key: 'test-plan-update',
			name: 'Old Name',
			priceCents: 1000,
		})

		const updated = await planManager.update(plan.id, {
			name: 'New Name',
			priceCents: 2000,
		})

		expect(updated.name).toBe('New Name')
		expect(updated.priceCents).toBe(2000)
	})

	test('list plans', async () => {
		const plans = await planManager.list()

		expect(plans.length).toBeGreaterThan(0)
	})

	test('delete plan', async () => {
		const plan = await planManager.create({
			key: 'test-plan-delete',
			name: 'Delete Test Plan',
			priceCents: 500,
		})

		await planManager.delete(plan.id)

		const fetched = await planManager.get(plan.id)
		expect(fetched).toBeNull()
	})
})

describe('SubscriptionManager', () => {
	test('create subscription for user', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'free',
		})

		expect(subscription.id).toBeDefined()
		expect(subscription.userId).toBe(userId1)
		expect(subscription.orgId).toBeUndefined()
		expect(subscription.planKey).toBe('free')
		expect(subscription.status).toBe('active')
		expect(subscription.currentPeriodEnd).toBeDefined()
	})

	test('create subscription for organization', async () => {
		const subscription = await subscriptionManager.create({
			orgId: orgId1,
			planKey: 'pro',
		})

		expect(subscription.id).toBeDefined()
		expect(subscription.orgId).toBe(orgId1)
		expect(subscription.userId).toBeUndefined()
		expect(subscription.planKey).toBe('pro')
		expect(subscription.status).toBe('active')
	})

	test('reject subscription with both userId and orgId', async () => {
		await expect(
			subscriptionManager.create({
				userId: userId1,
				orgId: orgId1,
				planKey: 'free',
			}),
		).rejects.toThrow('Cannot specify both userId and orgId')
	})

	test('reject subscription with neither userId nor orgId', async () => {
		await expect(
			subscriptionManager.create({
				planKey: 'free',
			}),
		).rejects.toThrow('Either userId or orgId must be provided')
	})

	test('get subscription by ID', async () => {
		const created = await subscriptionManager.create({
			userId: userId1,
			planKey: 'starter',
		})

		const fetched = await subscriptionManager.get(created.id)

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
		expect(fetched?.planKey).toBe('starter')
	})

	test('get active subscription for user', async () => {
		const subscription = await subscriptionManager.getForUser(userId1)

		expect(subscription).not.toBeNull()
		expect(subscription?.userId).toBe(userId1)
		expect(subscription?.status).toMatch(/active|trialing/)
	})

	test('get active subscription for org', async () => {
		const subscription = await subscriptionManager.getForOrg(orgId1)

		expect(subscription).not.toBeNull()
		expect(subscription?.orgId).toBe(orgId1)
		expect(subscription?.status).toMatch(/active|trialing/)
	})

	test('update subscription', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'free',
		})

		const updated = await subscriptionManager.update(subscription.id, {
			status: 'past_due',
		})

		expect(updated.status).toBe('past_due')
	})

	test('change subscription plan', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'free',
		})

		const updated = await subscriptionManager.changePlan(subscription.id, 'pro')

		expect(updated.planKey).toBe('pro')
	})

	test('cancel subscription at period end', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'pro',
		})

		const canceled = await subscriptionManager.cancel(subscription.id, false)

		expect(canceled.cancelAtPeriodEnd).toBe(true)
		expect(canceled.status).toBe('active') // Still active until period ends
	})

	test('cancel subscription immediately', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'pro',
		})

		const canceled = await subscriptionManager.cancel(subscription.id, true)

		expect(canceled.status).toBe('canceled')
		expect(canceled.cancelAtPeriodEnd).toBe(false)
	})

	test('reactivate canceled subscription', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'pro',
		})

		await subscriptionManager.cancel(subscription.id, true)

		const reactivated = await subscriptionManager.reactivate(subscription.id)

		expect(reactivated.status).toBe('active')
		expect(reactivated.cancelAtPeriodEnd).toBe(false)
	})

	test('list subscriptions', async () => {
		const subscriptions = await subscriptionManager.list()

		expect(subscriptions.length).toBeGreaterThan(0)
	})

	test('list subscriptions for user', async () => {
		const subscriptions = await subscriptionManager.list({ userId: userId1 })

		expect(subscriptions.length).toBeGreaterThan(0)
		expect(subscriptions.every((s) => s.userId === userId1)).toBe(true)
	})

	test('list subscriptions for org', async () => {
		const subscriptions = await subscriptionManager.list({ orgId: orgId1 })

		expect(subscriptions.length).toBeGreaterThan(0)
		expect(subscriptions.every((s) => s.orgId === orgId1)).toBe(true)
	})

	test('check if subscription is active', async () => {
		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'pro',
		})

		const isActive = await subscriptionManager.isActive(subscription.id)

		expect(isActive).toBe(true)
	})

	test('check if user has active subscription', async () => {
		const hasActive = await subscriptionManager.hasActiveSubscription(userId1)

		expect(hasActive).toBe(true)
	})

	test('check if org has active subscription', async () => {
		const hasActive = await subscriptionManager.hasActiveSubscription(undefined, orgId1)

		expect(hasActive).toBe(true)
	})

	test('create subscription with trial', async () => {
		const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days

		const subscription = await subscriptionManager.create({
			userId: userId1,
			planKey: 'pro',
			status: 'trialing',
			trialEndsAt: trialEnd,
		})

		expect(subscription.status).toBe('trialing')
		expect(subscription.trialEndsAt).toBeDefined()
	})
})
