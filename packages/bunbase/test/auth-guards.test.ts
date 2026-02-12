import { describe, expect, it } from 'bun:test'
import { authGuards } from '../src/core/guards/auth.ts'
import type { GuardError } from '../src/core/guards/types.ts'
import type { ActionContext } from '../src/core/types.ts'

// Mock OrgManager and SubscriptionManager
function createMockIAM(data: {
	organizations?: any[]
	memberships?: any[]
	subscriptions?: any[]
	plans?: any[]
}) {
	return {
		roles: {} as any,
		orgs: {
			getById: async (id: string) => {
				return (data.organizations ?? []).find((o: any) => o.id === id) ?? null
			},
			getMembership: async (orgId: string, userId: string) => {
				return (
					(data.memberships ?? []).find(
						(m: any) => m.org_id === orgId && m.user_id === userId,
					) ?? null
				)
			},
			getMemberCount: async (orgId: string) => {
				return (data.memberships ?? []).filter((m: any) => m.org_id === orgId)
					.length
			},
		},
		subscriptions: {
			get: async (orgId: string) => {
				return (
					(data.subscriptions ?? []).find((s: any) => s.orgId === orgId) ?? null
				)
			},
			getPlanFeatures: async (planKey: string) => {
				const plan = (data.plans ?? []).find((p: any) => p.key === planKey)
				return plan?.features ?? []
			},
		},
		invalidateCache: () => {},
	}
}

// Helper to create mock context
function createMockContext(
	overrides: Partial<ActionContext> & { iam?: any } = {},
): ActionContext {
	const { iam, ...rest } = overrides
	return {
		db: {} as any,
		storage: {} as any,
		kv: {} as any,
		logger: {
			info: () => {},
			error: () => {},
			debug: () => {},
			child: () => ({
				info: () => {},
				error: () => {},
				debug: () => {},
			}),
		} as any,
		traceId: 'test-trace',
		event: { emit: () => {} },
		auth: {} as any,
		iam: iam ?? createMockIAM({}),
		...rest,
	} as ActionContext
}

describe('authGuards.inOrg()', () => {
	it('should throw 401 when user is not authenticated', async () => {
		const guard = authGuards.inOrg()
		const ctx = createMockContext({ auth: {} as any })

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(401)
	})

	it('should throw 400 when orgId is not found in headers or query', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test')
		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
		})

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(400)
		expect(error?.message).toContain('Organization ID required')
	})

	it('should find orgId in x-org-id header', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const iam = createMockIAM({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			memberships: [
				{
					org_id: 'org-123',
					user_id: 'user-123',
					role: 'admin',
				},
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
			iam,
		})

		await guard(ctx)

		expect(ctx.auth.orgId).toBe('org-123')
		expect(ctx.auth.role).toBe('admin')
	})

	it('should find orgId in query params', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test?orgId=org-456')

		const iam = createMockIAM({
			organizations: [{ id: 'org-456', name: 'Test Org', slug: 'test-org' }],
			memberships: [
				{
					org_id: 'org-456',
					user_id: 'user-123',
					role: 'member',
				},
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
			iam,
		})

		await guard(ctx)

		expect(ctx.auth.orgId).toBe('org-456')
	})

	it('should throw 404 when organization not found', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'non-existent' },
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
			iam: createMockIAM({ organizations: [] }),
		})

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(404)
	})

	it('should throw 403 when user is not a member', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const iam = createMockIAM({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			memberships: [], // User is not a member
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
			iam,
		})

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(403)
		expect(error?.message).toContain('Not a member')
	})

	it('should set plan and features from subscription', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const iam = createMockIAM({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			memberships: [
				{
					org_id: 'org-123',
					user_id: 'user-123',
					role: 'member',
				},
			],
			subscriptions: [{ orgId: 'org-123', planKey: 'pro', status: 'active' }],
			plans: [
				{
					key: 'pro',
					features: ['org:create', 'org:analytics'],
				},
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
			iam,
		})

		await guard(ctx)

		expect(ctx.auth._orgPlan).toBe('pro')
		expect(ctx.auth._orgFeatures).toEqual(['org:create', 'org:analytics'])
	})

	it('should default to free plan when no subscription', async () => {
		const guard = authGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const iam = createMockIAM({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			memberships: [
				{
					org_id: 'org-123',
					user_id: 'user-123',
					role: 'member',
				},
			],
			plans: [
				{
					key: 'free',
					features: ['org:create'],
				},
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
			request,
			iam,
		})

		await guard(ctx)

		expect(ctx.auth._orgPlan).toBe('free')
		expect(ctx.auth._orgFeatures).toEqual(['org:create'])
	})
})

describe('authGuards.hasFeature()', () => {
	it('should pass when org has the feature', () => {
		const guard = authGuards.hasFeature('org:create')
		const ctx = createMockContext({
			auth: {
				userId: 'user-123',
				_orgFeatures: ['org:create'],
			} as any,
		})

		// Should not throw
		guard(ctx)
	})

	it('should throw 500 when org context is missing', () => {
		const guard = authGuards.hasFeature('org:create')
		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
		})

		let error: GuardError | undefined
		try {
			guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(500)
		expect(error?.message).toContain('Organization context required')
	})

	it('should throw 403 when org lacks the feature', () => {
		const guard = authGuards.hasFeature('org:analytics')
		const ctx = createMockContext({
			auth: {
				userId: 'user-123',
				_orgFeatures: ['org:create'], // Missing org:analytics
			} as any,
		})

		let error: GuardError | undefined
		try {
			guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(403)
		expect(error?.message).toContain('Upgrade required')
	})
})

describe('authGuards.trialActiveOrPaid()', () => {
	it('should pass when org is on paid plan', () => {
		const guard = authGuards.trialActiveOrPaid()
		const ctx = createMockContext({
			auth: {
				userId: 'user-123',
				_orgPlan: 'pro',
			} as any,
		})

		// Should not throw
		guard(ctx)
	})

	it('should throw 500 when org context is missing', () => {
		const guard = authGuards.trialActiveOrPaid()
		const ctx = createMockContext({
			auth: { userId: 'user-123' } as any,
		})

		let error: GuardError | undefined
		try {
			guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(500)
	})

	it('should throw 403 when org is on free plan', () => {
		const guard = authGuards.trialActiveOrPaid()
		const ctx = createMockContext({
			auth: {
				userId: 'user-123',
				_orgPlan: 'free',
			} as any,
		})

		let error: GuardError | undefined
		try {
			guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(403)
		expect(error?.message).toBe('Paid plan required')
	})
})
