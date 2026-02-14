/**
 * Integration tests for Organizations module
 * Tests organization CRUD, memberships, and invitations
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import Database from 'bun:sqlite'
import { sql as createSql } from 'bun'
import type { SQL } from 'bun'
import { Logger } from '../../../packages/bunbase/src/logger/index.ts'
import { OrganizationManager } from '../../../packages/bunbase/src/platform/orgs/manager.ts'
import { MembershipManager } from '../../../packages/bunbase/src/platform/orgs/membership-manager.ts'
import { InvitationManager } from '../../../packages/bunbase/src/platform/orgs/invitation-manager.ts'
import type { UserId, OrgId } from '../../../packages/bunbase/src/platform/core/types.ts'
import {
	OrgNotFoundError,
	OrgSlugTakenError,
	NotOrgMemberError,
	UserAlreadyExistsError,
	InvalidInvitationError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'

let sql: SQL
let logger: Logger
let orgManager: OrganizationManager
let membershipManager: MembershipManager
let invitationManager: InvitationManager

// Test user IDs
const userId1 = 'usr_test1' as UserId
const userId2 = 'usr_test2' as UserId
const userId3 = 'usr_test3' as UserId

beforeAll(async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error('DATABASE_URL environment variable is required for integration tests')
	}

	sql = createSql(dbUrl)
	logger = new Logger()

	orgManager = new OrganizationManager(sql, logger)
	membershipManager = new MembershipManager(sql, logger)
	invitationManager = new InvitationManager(sql, logger)

	// Create test users
	await sql`
		INSERT INTO users (id, email, password_hash, created_at)
		VALUES
			(${userId1}, 'user1@test.com', 'hash1', NOW()),
			(${userId2}, 'user2@test.com', 'hash2', NOW()),
			(${userId3}, 'user3@test.com', 'hash3', NOW())
		ON CONFLICT (id) DO NOTHING
	`
})

describe('OrganizationManager', () => {
	test('create organization with auto-generated slug', async () => {
		const org = await orgManager.create({
			name: 'Test Company',
			ownerId: userId1,
		})

		expect(org.id).toBeDefined()
		expect(org.name).toBe('Test Company')
		expect(org.slug).toBe('test-company')
		expect(org.ownerId).toBe(userId1)
		expect(org.createdAt).toBeDefined()
		expect(org.updatedAt).toBeDefined()
	})

	test('create organization with custom slug', async () => {
		const org = await orgManager.create({
			name: 'Another Company',
			slug: 'my-custom-slug',
			ownerId: userId1,
		})

		expect(org.slug).toBe('my-custom-slug')
	})

	test('reject duplicate slug', async () => {
		await orgManager.create({
			name: 'Unique Org',
			slug: 'unique-slug',
			ownerId: userId1,
		})

		await expect(
			orgManager.create({
				name: 'Duplicate Org',
				slug: 'unique-slug',
				ownerId: userId2,
			}),
		).rejects.toThrow(OrgSlugTakenError)
	})

	test('auto-generate unique slug on conflict', async () => {
		await orgManager.create({
			name: 'Acme Corp',
			ownerId: userId1,
		})

		const org2 = await orgManager.create({
			name: 'Acme Corp', // Same name, should get unique slug
			ownerId: userId2,
		})

		expect(org2.slug).toMatch(/^acme-corp-\d+$/)
	})

	test('get organization by ID', async () => {
		const created = await orgManager.create({
			name: 'Fetch Test Org',
			ownerId: userId1,
		})

		const fetched = await orgManager.get(created.id)

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
		expect(fetched?.name).toBe('Fetch Test Org')
	})

	test('get organization by slug', async () => {
		const created = await orgManager.create({
			name: 'Slug Test Org',
			slug: 'slug-test',
			ownerId: userId1,
		})

		const fetched = await orgManager.getBySlug('slug-test')

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
	})

	test('update organization name', async () => {
		const org = await orgManager.create({
			name: 'Old Name',
			ownerId: userId1,
		})

		const updated = await orgManager.update(org.id, {
			name: 'New Name',
		})

		expect(updated.name).toBe('New Name')
		expect(updated.slug).toBe(org.slug) // Slug unchanged
	})

	test('update organization slug', async () => {
		const org = await orgManager.create({
			name: 'Slug Update Test',
			ownerId: userId1,
		})

		const updated = await orgManager.update(org.id, {
			slug: 'new-slug',
		})

		expect(updated.slug).toBe('new-slug')
	})

	test('reject slug update to taken slug', async () => {
		const org1 = await orgManager.create({
			name: 'Org 1',
			slug: 'taken-slug',
			ownerId: userId1,
		})

		const org2 = await orgManager.create({
			name: 'Org 2',
			slug: 'other-slug',
			ownerId: userId1,
		})

		await expect(orgManager.update(org2.id, { slug: 'taken-slug' })).rejects.toThrow(
			OrgSlugTakenError,
		)
	})

	test('delete organization', async () => {
		const org = await orgManager.create({
			name: 'Delete Test Org',
			ownerId: userId1,
		})

		await orgManager.delete(org.id)

		const fetched = await orgManager.get(org.id)
		expect(fetched).toBeNull()
	})

	test('list organizations for user', async () => {
		// Create orgs where user1 is owner
		await orgManager.create({ name: 'User1 Org A', ownerId: userId1 })
		await orgManager.create({ name: 'User1 Org B', ownerId: userId1 })

		const orgs = await orgManager.listForUser(userId1)

		expect(orgs.length).toBeGreaterThanOrEqual(2)
		expect(orgs.some((o) => o.name === 'User1 Org A')).toBe(true)
		expect(orgs.some((o) => o.name === 'User1 Org B')).toBe(true)
	})

	test('transfer ownership', async () => {
		const org = await orgManager.create({
			name: 'Transfer Test Org',
			ownerId: userId1,
		})

		// Add user2 as member first
		await membershipManager.addMember({
			orgId: org.id,
			userId: userId2,
			role: 'admin',
		})

		// Transfer ownership
		await orgManager.transferOwnership({
			orgId: org.id,
			currentOwnerId: userId1,
			newOwnerId: userId2,
		})

		const updated = await orgManager.get(org.id)
		expect(updated?.ownerId).toBe(userId2)

		// Check membership roles
		const user1Role = await orgManager.getUserRole(org.id, userId1)
		const user2Role = await orgManager.getUserRole(org.id, userId2)

		expect(user1Role).toBe('admin') // Downgraded from owner
		expect(user2Role).toBe('owner') // Upgraded to owner
	})

	test('check if user is member', async () => {
		const org = await orgManager.create({
			name: 'Member Check Org',
			ownerId: userId1,
		})

		const isMember = await orgManager.isMember(org.id, userId1)
		const isNotMember = await orgManager.isMember(org.id, userId2)

		expect(isMember).toBe(true)
		expect(isNotMember).toBe(false)
	})

	test('check if user is owner', async () => {
		const org = await orgManager.create({
			name: 'Owner Check Org',
			ownerId: userId1,
		})

		const isOwner = await orgManager.isOwner(org.id, userId1)
		const isNotOwner = await orgManager.isOwner(org.id, userId2)

		expect(isOwner).toBe(true)
		expect(isNotOwner).toBe(false)
	})
})

describe('MembershipManager', () => {
	let testOrg: { id: OrgId }

	beforeAll(async () => {
		testOrg = await orgManager.create({
			name: 'Membership Test Org',
			ownerId: userId1,
		})
	})

	test('add member to organization', async () => {
		const membership = await membershipManager.addMember({
			orgId: testOrg.id,
			userId: userId2,
			role: 'member',
		})

		expect(membership.orgId).toBe(testOrg.id)
		expect(membership.userId).toBe(userId2)
		expect(membership.role).toBe('member')
		expect(membership.joinedAt).toBeDefined()
	})

	test('reject duplicate membership', async () => {
		await expect(
			membershipManager.addMember({
				orgId: testOrg.id,
				userId: userId2,
				role: 'member',
			}),
		).rejects.toThrow(UserAlreadyExistsError)
	})

	test('list members', async () => {
		const members = await membershipManager.listMembers(testOrg.id)

		expect(members.length).toBeGreaterThanOrEqual(2)
		expect(members.some((m) => m.userId === userId1)).toBe(true) // Owner
		expect(members.some((m) => m.userId === userId2)).toBe(true) // Added member
	})

	test('update member role', async () => {
		const updated = await membershipManager.updateMemberRole({
			orgId: testOrg.id,
			userId: userId2,
			role: 'admin',
		})

		expect(updated.role).toBe('admin')
	})

	test('get member count', async () => {
		const count = await membershipManager.getMemberCount(testOrg.id)

		expect(count).toBeGreaterThanOrEqual(2)
	})

	test('list members with user info', async () => {
		const members = await membershipManager.listMembersWithUserInfo(testOrg.id)

		expect(members.length).toBeGreaterThanOrEqual(2)
		expect(members[0].email).toBeDefined()
	})

	test('get user organizations', async () => {
		const orgs = await membershipManager.getUserOrganizations(userId2)

		expect(orgs.length).toBeGreaterThanOrEqual(1)
		expect(orgs.some((o) => o.orgId === testOrg.id)).toBe(true)
	})

	test('remove member', async () => {
		await membershipManager.removeMember({
			orgId: testOrg.id,
			userId: userId2,
		})

		const isMember = await orgManager.isMember(testOrg.id, userId2)
		expect(isMember).toBe(false)
	})

	test('cannot remove last owner', async () => {
		await expect(
			membershipManager.removeMember({
				orgId: testOrg.id,
				userId: userId1,
			}),
		).rejects.toThrow(CannotRemoveLastOwnerError)
	})
})

describe('InvitationManager', () => {
	let testOrg: { id: OrgId }

	beforeAll(async () => {
		testOrg = await orgManager.create({
			name: 'Invitation Test Org',
			ownerId: userId1,
		})
	})

	test('create invitation', async () => {
		const invitation = await invitationManager.createInvitation({
			orgId: testOrg.id,
			email: 'invite1@test.com',
			role: 'member',
			invitedBy: userId1,
		})

		expect(invitation.id).toBeDefined()
		expect(invitation.orgId).toBe(testOrg.id)
		expect(invitation.email).toBe('invite1@test.com')
		expect(invitation.role).toBe('member')
		expect(invitation.status).toBe('pending')
		expect(invitation.token).toBeDefined()
		expect(invitation.expiresAt).toBeDefined()
	})

	test('reject duplicate invitation', async () => {
		await invitationManager.createInvitation({
			orgId: testOrg.id,
			email: 'invite2@test.com',
			role: 'member',
			invitedBy: userId1,
		})

		await expect(
			invitationManager.createInvitation({
				orgId: testOrg.id,
				email: 'invite2@test.com',
				role: 'member',
				invitedBy: userId1,
			}),
		).rejects.toThrow(InvalidInvitationError)
	})

	test('accept invitation', async () => {
		// Create test user
		await sql`
			INSERT INTO users (id, email, password_hash, created_at)
			VALUES ('usr_invite_test', 'invite3@test.com', 'hash', NOW())
			ON CONFLICT (id) DO NOTHING
		`

		const invitation = await invitationManager.createInvitation({
			orgId: testOrg.id,
			email: 'invite3@test.com',
			role: 'member',
			invitedBy: userId1,
		})

		const result = await invitationManager.acceptInvitation({
			token: invitation.token,
			userId: 'usr_invite_test' as UserId,
		})

		expect(result.orgId).toBe(testOrg.id)
		expect(result.role).toBe('member')

		// Verify membership created
		const isMember = await orgManager.isMember(testOrg.id, 'usr_invite_test' as UserId)
		expect(isMember).toBe(true)
	})

	test('reject invalid token', async () => {
		await expect(
			invitationManager.acceptInvitation({
				token: 'invalid-token',
				userId: userId2,
			}),
		).rejects.toThrow(InvalidInvitationError)
	})

	test('reject accepting already accepted invitation', async () => {
		// Create and accept invitation
		const invitation = await invitationManager.createInvitation({
			orgId: testOrg.id,
			email: 'user2@test.com',
			role: 'member',
			invitedBy: userId1,
		})

		// First acceptance
		await invitationManager.acceptInvitation({
			token: invitation.token,
			userId: userId2,
		})

		// Second acceptance should fail
		await expect(
			invitationManager.acceptInvitation({
				token: invitation.token,
				userId: userId2,
			}),
		).rejects.toThrow()
	})

	test('list invitations for organization', async () => {
		const invitations = await invitationManager.listInvitations(testOrg.id)

		expect(invitations.length).toBeGreaterThanOrEqual(1)
	})

	test('revoke invitation', async () => {
		const invitation = await invitationManager.createInvitation({
			orgId: testOrg.id,
			email: 'revoke@test.com',
			role: 'member',
			invitedBy: userId1,
		})

		await invitationManager.revokeInvitation(invitation.id)

		const fetched = await invitationManager.getInvitation(invitation.id)
		expect(fetched?.status).toBe('revoked')
	})

	test('list invitations for email', async () => {
		await invitationManager.createInvitation({
			orgId: testOrg.id,
			email: 'multiorginvite@test.com',
			role: 'member',
			invitedBy: userId1,
		})

		const invitations = await invitationManager.listInvitationsForEmail('multiorginvite@test.com')

		expect(invitations.length).toBeGreaterThanOrEqual(1)
		expect(invitations[0].orgName).toBeDefined()
		expect(invitations[0].orgSlug).toBeDefined()
	})
})
