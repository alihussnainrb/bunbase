import { describe, expect, it } from 'bun:test'
import { OrganizationService } from '../src/saas/organizations.ts'

describe('OrganizationService', () => {
	// Create a mock DB that mimics the TypedQueryBuilder chainable API
	function createMockDb() {
		const organizations: any[] = []
		const memberships: any[] = []

		function createChainableQuery(store: any[], tableName: string) {
			const wheres: Array<{ col: string; val: any }> = []

			const chain: any = {
				eq: (col: string, val: any) => {
					wheres.push({ col, val })
					return chain
				},
				select: (..._fields: any[]) => chain,
				limit: (_n: number) => chain,
				single: async () => {
					const result = store.find((r) =>
						wheres.every(({ col, val }) => r[col] === val),
					)
					return result || null
				},
				exec: async () => {
					return store.filter((r) =>
						wheres.every(({ col, val }) => r[col] === val),
					)
				},
				insert: async (data: any) => {
					if (tableName === 'organizations') {
						const org = {
							id: `org-${Date.now()}`,
							name: data.name,
							slug: data.slug,
							ownerId: data.owner_id,
							owner_id: data.owner_id,
							createdAt: new Date(),
							updatedAt: new Date(),
						}
						organizations.push(org)
						return org
					}
					if (tableName === 'org_memberships') {
						const membership = {
							id: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
							orgId: data.org_id,
							org_id: data.org_id,
							userId: data.user_id,
							user_id: data.user_id,
							role: data.role,
							joinedAt: new Date(),
						}
						memberships.push(membership)
						return membership
					}
					return null
				},
			}

			return chain
		}

		return {
			from: (table: string) => {
				if (table === 'organizations') {
					return createChainableQuery(organizations, 'organizations')
				}
				if (table === 'org_memberships') {
					return createChainableQuery(memberships, 'org_memberships')
				}
				return createChainableQuery([], table)
			},
		}
	}

	describe('create()', () => {
		it('should create organization with owner as member', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('user-123', 'Test Org', 'test-org')

			expect(org).toBeDefined()
			expect(org.name).toBe('Test Org')
			expect(org.slug).toBe('test-org')
			expect(org.ownerId).toBe('user-123')
		})

		it('should add owner as member with owner role', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('user-123', 'Test Org', 'test-org')

			// Verify owner was added as member
			const membership = await service.getMembership(org.id, 'user-123')
			expect(membership).toBeDefined()
			expect(membership?.role).toBe('owner')
		})
	})

	describe('getById()', () => {
		it('should return organization by id', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			// First create an org
			const created = await service.create('user-123', 'Test Org', 'test-org')

			// Then retrieve it
			const org = await service.getById(created.id)

			expect(org).toBeDefined()
			expect(org?.id).toBe(created.id)
			expect(org?.name).toBe('Test Org')
		})

		it('should return null for non-existent organization', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.getById('non-existent')

			expect(org).toBeNull()
		})
	})

	describe('addMember()', () => {
		it('should add member with default role', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			// First create an org
			const org = await service.create('owner-123', 'Test Org', 'test-org')

			// Add a member
			const membership = await service.addMember(org.id, 'user-456')

			expect(membership).toBeDefined()
			expect(membership.userId).toBe('user-456')
			expect(membership.orgId).toBe(org.id)
			expect(membership.role).toBe('member')
		})

		it('should add member with specified role', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('owner-123', 'Test Org', 'test-org')
			const membership = await service.addMember(org.id, 'user-456', 'admin')

			expect(membership.role).toBe('admin')
		})
	})

	describe('getMembership()', () => {
		it('should return membership for org member', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('user-123', 'Test Org', 'test-org')
			await service.addMember(org.id, 'user-456', 'member')

			const membership = await service.getMembership(org.id, 'user-456')

			expect(membership).toBeDefined()
			expect(membership?.userId).toBe('user-456')
			expect(membership?.orgId).toBe(org.id)
		})

		it('should return null for non-member', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('user-123', 'Test Org', 'test-org')

			const membership = await service.getMembership(org.id, 'non-member')

			expect(membership).toBeNull()
		})
	})

	describe('getMemberRole()', () => {
		it('should return role for member', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('user-123', 'Test Org', 'test-org')
			await service.addMember(org.id, 'user-456', 'admin')

			const role = await service.getMemberRole(org.id, 'user-456')

			expect(role).toBe('admin')
		})

		it('should return null for non-member', async () => {
			const db = createMockDb()
			const service = new OrganizationService(db)

			const org = await service.create('user-123', 'Test Org', 'test-org')

			const role = await service.getMemberRole(org.id, 'non-member')

			expect(role).toBeNull()
		})
	})
})
