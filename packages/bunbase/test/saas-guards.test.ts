import { beforeEach, describe, expect, it, spyOn } from 'bun:test'
import type { ActionContext } from '../src/core/types.ts'
import { saasGuards } from '../src/guards/saas.ts'
import type { GuardError } from '../src/guards/types.ts'

// Mock database using chainable API matching TypedQueryBuilder
function createMockDb(overrides: any = {}) {
	return {
		from: (table: string) => {
			const store: any[] = overrides[table] || []
			const wheres: Array<{ col: string; val: any }> = []

			const chain: any = {
				eq: (col: string, val: any) => {
					wheres.push({ col, val })
					return chain
				},
				select: (..._fields: any[]) => chain,
				limit: (_n: number) => chain,
				ilike: (_col: string, _pattern: string) => chain,
				orderBy: (_col: string, _dir: string) => chain,
				single: async () => {
					const result = store.find((r: any) =>
						wheres.every(({ col, val }) => r[col] === val),
					)
					return result || null
				},
				exec: async () => {
					return store.filter((r: any) =>
						wheres.every(({ col, val }) => r[col] === val),
					)
				},
				insert: async (data: any) => {
					return { id: 'test-id', ...data }
				},
			}

			return chain
		},
	}
}

// Helper to create mock context
function createMockContext(
	overrides: Partial<ActionContext> = {},
): ActionContext {
	return {
		db: createMockDb(),
		logger: {
			info: () => {},
			error: () => {},
			debug: () => {},
			child: () => ({ info: () => {}, error: () => {}, debug: () => {} }),
		} as any,
		traceId: 'test-trace',
		event: { emit: () => {} },
		auth: {},
		...overrides,
	} as ActionContext
}

describe('saasGuards.inOrg()', () => {
	it('should throw 401 when user is not authenticated', async () => {
		const guard = saasGuards.inOrg()
		const ctx = createMockContext({ auth: {} })

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(401)
	})

	it('should throw 400 when orgId is not found in headers or query', async () => {
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test')
		const ctx = createMockContext({
			auth: { userId: 'user-123' },
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
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const db = createMockDb({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			org_memberships: [
				{ org_id: 'org-123', user_id: 'user-123', role: 'admin' },
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' },
			request,
			db,
		})

		await guard(ctx)

		expect(ctx.auth.orgId).toBe('org-123')
		expect(ctx.auth.role).toBe('admin')
		expect(ctx.org).toBeDefined()
		expect(ctx.org?.id).toBe('org-123')
	})

	it('should find orgId in query params', async () => {
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test?orgId=org-456')

		const db = createMockDb({
			organizations: [{ id: 'org-456', name: 'Test Org', slug: 'test-org' }],
			org_memberships: [
				{ org_id: 'org-456', user_id: 'user-123', role: 'member' },
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' },
			request,
			db,
		})

		await guard(ctx)

		expect(ctx.auth.orgId).toBe('org-456')
	})

	it('should throw 404 when organization not found', async () => {
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'non-existent' },
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' },
			request,
			db: createMockDb({ organizations: [] }),
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
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const db = createMockDb({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			org_memberships: [], // User is not a member
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' },
			request,
			db,
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

	it('should populate permissions from role', async () => {
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const db = createMockDb({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			org_memberships: [
				{ org_id: 'org-123', user_id: 'user-123', role: 'owner' },
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' },
			request,
			db,
		})

		await guard(ctx)

		expect(ctx.auth.permissions).toContain('*') // Owner has all permissions
	})

	it('should set free plan features by default', async () => {
		const guard = saasGuards.inOrg()
		const request = new Request('http://localhost:3000/test', {
			headers: { 'x-org-id': 'org-123' },
		})

		const db = createMockDb({
			organizations: [{ id: 'org-123', name: 'Test Org', slug: 'test-org' }],
			org_memberships: [
				{ org_id: 'org-123', user_id: 'user-123', role: 'member' },
			],
		})

		const ctx = createMockContext({
			auth: { userId: 'user-123' },
			request,
			db,
		})

		await guard(ctx)

		expect(ctx.org?.plan).toBe('free')
		expect(ctx.org?.features).toContain('org:create')
	})
})

describe('saasGuards.hasFeature()', () => {
	it('should pass when org has the feature', () => {
		const guard = saasGuards.hasFeature('org:create')
		const ctx = createMockContext({
			org: {
				id: 'org-123',
				name: 'Test',
				slug: 'test',
				plan: 'free',
				features: ['org:create'],
				memberCount: 1,
			},
		})

		// Should not throw
		guard(ctx)
	})

	it('should throw 500 when org context is missing', () => {
		const guard = saasGuards.hasFeature('org:create')
		const ctx = createMockContext({ org: undefined })

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
		const guard = saasGuards.hasFeature('org:analytics')
		const ctx = createMockContext({
			org: {
				id: 'org-123',
				name: 'Test',
				slug: 'test',
				plan: 'free',
				features: ['org:create'], // Missing org:analytics
				memberCount: 1,
			},
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

describe('saasGuards.trialActiveOrPaid()', () => {
	it('should pass when org is on paid plan', () => {
		const guard = saasGuards.trialActiveOrPaid()
		const ctx = createMockContext({
			org: {
				id: 'org-123',
				name: 'Test',
				slug: 'test',
				plan: 'pro', // Paid plan
				features: [],
				memberCount: 1,
			},
		})

		// Should not throw
		guard(ctx)
	})

	it('should throw 500 when org context is missing', () => {
		const guard = saasGuards.trialActiveOrPaid()
		const ctx = createMockContext({ org: undefined })

		let error: GuardError | undefined
		try {
			guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(500)
	})

	it('should throw 403 when org is on free plan', () => {
		const guard = saasGuards.trialActiveOrPaid()
		const ctx = createMockContext({
			org: {
				id: 'org-123',
				name: 'Test',
				slug: 'test',
				plan: 'free',
				features: [],
				memberCount: 1,
			},
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
