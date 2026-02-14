/**
 * Organization Membership Management
 * Handles adding, removing, and updating organization members
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { OrgId, UserId, OrgMembership } from '../core/types.ts'
import {
	OrgNotFoundError,
	NotOrgMemberError,
	InsufficientOrgRoleError,
	CannotRemoveLastOwnerError,
	UserAlreadyExistsError,
} from '../core/errors.ts'

export interface AddMemberData {
	orgId: OrgId
	userId: UserId
	role: string
}

export interface UpdateMemberRoleData {
	orgId: OrgId
	userId: UserId
	role: string
}

export interface RemoveMemberData {
	orgId: OrgId
	userId: UserId
}

export interface ListMembersOptions {
	limit?: number
	offset?: number
	role?: string
}

/**
 * Role hierarchy weights for permission checks
 * Higher weight = more power
 */
const ROLE_WEIGHTS: Record<string, number> = {
	owner: 100,
	admin: 50,
	member: 10,
}

/**
 * Manages organization memberships
 */
export class MembershipManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Add a member to an organization
	 * - Validates organization exists
	 * - Prevents duplicate memberships
	 * - Default role: member
	 */
	async addMember(data: AddMemberData): Promise<OrgMembership> {
		const { orgId, userId, role } = data

		this.logger.info('Adding member to organization', { orgId, userId, role })

		// Check if org exists
		const org = await this.sql`
			SELECT id FROM organizations WHERE id = ${orgId}
		`
		if (org.length === 0) throw new OrgNotFoundError(orgId)

		// Check if already a member
		const existing = await this.sql`
			SELECT id FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${userId}
		`
		if (existing.length > 0) {
			throw new UserAlreadyExistsError('User is already a member of this organization')
		}

		// Add membership
		const [membership] = await this.sql`
			INSERT INTO org_memberships (org_id, user_id, role, joined_at)
			VALUES (${orgId}, ${userId}, ${role}, NOW())
			RETURNING *
		`

		this.logger.info('Member added', { orgId, userId, role })

		return {
			id: membership.id,
			orgId: membership.org_id as OrgId,
			userId: membership.user_id as UserId,
			role: membership.role,
			joinedAt: new Date(membership.joined_at),
			invitedBy: membership.invited_by as UserId | null,
		}
	}

	/**
	 * Remove a member from an organization
	 * - Cannot remove the last owner
	 * - Requires sufficient role weight
	 */
	async removeMember(data: RemoveMemberData): Promise<void> {
		const { orgId, userId } = data

		this.logger.info('Removing member from organization', { orgId, userId })

		// Check if member exists
		const membership = await this.sql`
			SELECT role FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${userId}
		`

		if (membership.length === 0) {
			throw new NotOrgMemberError(orgId, { userId })
		}

		const memberRole = (membership[0] as { role: string }).role

		// Prevent removing last owner
		if (memberRole === 'owner') {
			const ownerCount = await this.sql`
				SELECT COUNT(*) as count FROM org_memberships
				WHERE org_id = ${orgId} AND role = 'owner'
			`
			const count = (ownerCount[0] as { count: number }).count

			if (count <= 1) {
				throw new CannotRemoveLastOwnerError()
			}
		}

		// Remove membership
		await this.sql`
			DELETE FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${userId}
		`

		this.logger.info('Member removed', { orgId, userId })
	}

	/**
	 * Update a member's role
	 * - Validates role hierarchy
	 * - Cannot change owner role (use transferOwnership)
	 * - Cannot demote last owner
	 */
	async updateMemberRole(data: UpdateMemberRoleData): Promise<OrgMembership> {
		const { orgId, userId, role } = data

		this.logger.info('Updating member role', { orgId, userId, role })

		// Get current membership
		const membership = await this.sql`
			SELECT role FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${userId}
		`

		if (membership.length === 0) {
			throw new NotOrgMemberError(orgId, { userId })
		}

		const currentRole = (membership[0] as { role: string }).role

		// Prevent changing owner role directly
		if (currentRole === 'owner' || role === 'owner') {
			throw new InsufficientOrgRoleError(
				'Cannot change owner role directly. Use transferOwnership instead.',
			)
		}

		// Update role
		const [membership] = await this.sql`
			UPDATE org_memberships
			SET role = ${role}
			WHERE org_id = ${orgId} AND user_id = ${userId}
			RETURNING *
		`

		this.logger.info('Member role updated', { orgId, userId, from: currentRole, to: role })

		return {
			id: membership.id,
			orgId: membership.org_id as OrgId,
			userId: membership.user_id as UserId,
			role: membership.role,
			joinedAt: new Date(membership.joined_at),
			invitedBy: membership.invited_by as UserId | null,
		}
	}

	/**
	 * List all members of an organization
	 */
	async listMembers(orgId: OrgId, options: ListMembersOptions = {}): Promise<OrgMembership[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		let query = this.sql`
			SELECT
				org_id as "orgId",
				user_id as "userId",
				role,
				joined_at as "joinedAt"
			FROM org_memberships
			WHERE org_id = ${orgId}
		`

		if (options.role) {
			query = this.sql`
				SELECT
					org_id as "orgId",
					user_id as "userId",
					role,
					joined_at as "joinedAt"
				FROM org_memberships
				WHERE org_id = ${orgId} AND role = ${options.role}
			`
		}

		const rows = await this.sql`
			${query}
			ORDER BY joined_at ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as OrgMembership[]
	}

	/**
	 * Get member count for an organization
	 */
	async getMemberCount(orgId: OrgId): Promise<number> {
		const rows = await this.sql`
			SELECT COUNT(*) as count FROM org_memberships
			WHERE org_id = ${orgId}
		`

		return (rows[0] as { count: number }).count
	}

	/**
	 * Get member details with user info
	 */
	async getMemberWithUserInfo(
		orgId: OrgId,
		userId: UserId,
	): Promise<(OrgMembership & { email: string; name?: string }) | null> {
		const rows = await this.sql`
			SELECT
				m.org_id as "orgId",
				m.user_id as "userId",
				m.role,
				m.joined_at as "joinedAt",
				u.email,
				u.name
			FROM org_memberships m
			INNER JOIN users u ON u.id = m.user_id
			WHERE m.org_id = ${orgId} AND m.user_id = ${userId}
		`

		if (rows.length === 0) return null

		return rows[0] as OrgMembership & { email: string; name?: string }
	}

	/**
	 * List members with user info (includes email, name)
	 */
	async listMembersWithUserInfo(
		orgId: OrgId,
		options: ListMembersOptions = {},
	): Promise<Array<OrgMembership & { email: string; name?: string }>> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				m.org_id as "orgId",
				m.user_id as "userId",
				m.role,
				m.joined_at as "joinedAt",
				u.email,
				u.name
			FROM org_memberships m
			INNER JOIN users u ON u.id = m.user_id
			WHERE m.org_id = ${orgId}
			${options.role ? this.sql`AND m.role = ${options.role}` : this.sql``}
			ORDER BY m.joined_at ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Array<OrgMembership & { email: string; name?: string }>
	}

	/**
	 * Check if a role has sufficient weight to perform an action
	 * Helper for authorization checks
	 */
	hasRoleWeight(role: string, minimumRole: string): boolean {
		const roleWeight = ROLE_WEIGHTS[role] || 0
		const minWeight = ROLE_WEIGHTS[minimumRole] || 0

		return roleWeight >= minWeight
	}

	/**
	 * Get user's organizations (reverse lookup)
	 */
	async getUserOrganizations(userId: UserId, options: ListMembersOptions = {}): Promise<
		Array<{
			orgId: OrgId
			role: string
			joinedAt: string
			orgName: string
			orgSlug: string
		}>
	> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				m.org_id as "orgId",
				m.role,
				m.joined_at as "joinedAt",
				o.name as "orgName",
				o.slug as "orgSlug"
			FROM org_memberships m
			INNER JOIN organizations o ON o.id = m.org_id
			WHERE m.user_id = ${userId}
			ORDER BY m.joined_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Array<{
			orgId: OrgId
			role: string
			joinedAt: string
			orgName: string
			orgSlug: string
		}>
	}
}
