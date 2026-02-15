/**
 * Organization Invitation Management
 * Handles creating, accepting, and revoking organization invitations
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { OrgId, UserId, OrgInvitation, InvitationId } from '../core/types.ts'
import {
	OrgNotFoundError,
	InvalidInvitationError,
	InvitationAlreadyAcceptedError,
	UserAlreadyExistsError,
} from '../core/errors.ts'
import { newInvitationId, generateInvitationToken, hashToken } from '../core/ids.ts'

export interface CreateInvitationData {
	orgId: OrgId
	email: string
	role: string
	invitedBy: UserId
	expiresInDays?: number
}

export interface AcceptInvitationData {
	token: string
	userId: UserId
}

export interface ListInvitationsOptions {
	limit?: number
	offset?: number
	status?: 'pending' | 'accepted' | 'revoked' | 'expired'
}

/**
 * Manages organization invitations
 */
export class InvitationManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Create a new invitation
	 * - Generates secure token
	 * - Sets expiration (default 7 days)
	 * - Stores hashed token
	 * - Returns plain token (only time it's visible)
	 */
	async createInvitation(data: CreateInvitationData): Promise<OrgInvitation & { token: string }> {
		const { orgId, email, role, invitedBy, expiresInDays = 7 } = data

		this.logger.info('Creating organization invitation', { orgId, email, role })

		// Validate org exists
		const org = await this.sql`
			SELECT id FROM organizations WHERE id = ${orgId}
		`
		if (org.length === 0) throw new OrgNotFoundError(orgId)

		// Check if user is already a member
		const existingMember = await this.sql`
			SELECT m.id
			FROM org_memberships m
			INNER JOIN users u ON u.id = m.user_id
			WHERE m.org_id = ${orgId} AND u.email = ${email}
		`
		if (existingMember.length > 0) {
			throw new UserAlreadyExistsError('User is already a member of this organization')
		}

		// Check for pending invitation
		const existingInvitation = await this.sql`
			SELECT id FROM org_invitations
			WHERE org_id = ${orgId}
			  AND email = ${email}
			  AND status = 'pending'
			  AND expires_at > NOW()
		`
		if (existingInvitation.length > 0) {
			throw new InvalidInvitationError({ reason: 'An active invitation already exists for this email' })
		}

		// Generate invitation ID and token
		const invitationId = newInvitationId()
		const token = generateInvitationToken()
		const tokenHash = await hashToken(token)

		// Calculate expiration
		const expiresAt = new Date()
		expiresAt.setDate(expiresAt.getDate() + expiresInDays)

		// Create invitation
		await this.sql`
			INSERT INTO org_invitations (
				id,
				org_id,
				email,
				role,
				invited_by,
				token_hash,
				status,
				created_at,
				expires_at
			)
			VALUES (
				${invitationId},
				${orgId},
				${email},
				${role},
				${invitedBy},
				${tokenHash},
				'pending',
				NOW(),
				${expiresAt.toISOString()}
			)
		`

		this.logger.info('Invitation created', { invitationId, orgId, email })

		return {
			id: invitationId,
			orgId,
			email,
			role,
			tokenHash,
			invitedBy,
			expiresAt: expiresAt,
			acceptedAt: null,
			acceptedBy: null,
			revokedAt: null,
			createdAt: new Date(),
			token, // Only returned here, never stored plain
		}
	}

	/**
	 * Accept an invitation
	 * - Validates token
	 * - Checks expiration
	 * - Prevents duplicate acceptance
	 * - Creates membership
	 * - Marks invitation as accepted
	 */
	async acceptInvitation(data: AcceptInvitationData): Promise<{
		orgId: OrgId
		role: string
	}> {
		const { token, userId } = data

		this.logger.info('Accepting invitation', { userId })

		// Hash token for lookup
		const tokenHash = hashToken(token)

		// Find invitation
		const rows = await this.sql`
			SELECT
				id,
				org_id as "orgId",
				email,
				role,
				status,
				expires_at as "expiresAt"
			FROM org_invitations
			WHERE token_hash = ${tokenHash}
		`

		if (rows.length === 0) {
			throw new InvalidInvitationError({ reason: 'Invalid invitation token' })
		}

		const invitation = rows[0] as {
			id: string
			orgId: string
			email: string
			role: string
			status: string
			expiresAt: string
		}

		// Check if already accepted
		if (invitation.status === 'accepted') {
			throw new InvitationAlreadyAcceptedError()
		}

		// Check if revoked
		if (invitation.status === 'revoked') {
			throw new InvalidInvitationError({ reason: 'This invitation has been revoked' })
		}

		// Check expiration
		if (new Date(invitation.expiresAt) < new Date()) {
			throw new InvalidInvitationError({ reason: 'This invitation has expired' })
		}

		// Verify user email matches invitation email
		const userRows = await this.sql`
			SELECT email FROM users WHERE id = ${userId}
		`
		if (userRows.length === 0) {
			throw new InvalidInvitationError({ reason: 'User not found' })
		}

		const userEmail = (userRows[0] as { email: string }).email
		if (userEmail !== invitation.email) {
			throw new InvalidInvitationError({ reason: 'User email does not match invitation' })
		}

		// Check if already a member (race condition protection)
		const existingMembership = await this.sql`
			SELECT id FROM org_memberships
			WHERE org_id = ${invitation.orgId} AND user_id = ${userId}
		`
		if (existingMembership.length > 0) {
			throw new UserAlreadyExistsError('User is already a member of this organization')
		}

		// Accept invitation in transaction
		await this.sql.begin(async (tx) => {
			// Create membership
			await tx`
				INSERT INTO org_memberships (org_id, user_id, role, joined_at)
				VALUES (${invitation.orgId}, ${userId}, ${invitation.role}, NOW())
			`

			// Mark invitation as accepted
			await tx`
				UPDATE org_invitations
				SET status = 'accepted', accepted_at = NOW()
				WHERE id = ${invitation.id}
			`
		})

		this.logger.info('Invitation accepted', {
			invitationId: invitation.id,
			userId,
			orgId: invitation.orgId,
		})

		return {
			orgId: invitation.orgId as OrgId,
			role: invitation.role,
		}
	}

	/**
	 * Revoke an invitation
	 * - Only pending invitations can be revoked
	 * - Prevents acceptance after revocation
	 */
	async revokeInvitation(invitationId: InvitationId): Promise<void> {
		this.logger.info('Revoking invitation', { invitationId })

		// Check invitation exists and is pending
		const rows = await this.sql`
			SELECT status FROM org_invitations
			WHERE id = ${invitationId}
		`

		if (rows.length === 0) {
			throw new InvalidInvitationError({ reason: 'Invitation not found' })
		}

		const status = (rows[0] as { status: string }).status

		if (status !== 'pending') {
			throw new InvalidInvitationError({ reason: `Cannot revoke ${status} invitation`, status })
		}

		// Revoke invitation
		await this.sql`
			UPDATE org_invitations
			SET status = 'revoked', revoked_at = NOW()
			WHERE id = ${invitationId}
		`

		this.logger.info('Invitation revoked', { invitationId })
	}

	/**
	 * Get invitation by ID
	 */
	async getInvitation(invitationId: InvitationId): Promise<OrgInvitation | null> {
		const rows = await this.sql`
			SELECT
				id,
				org_id as "orgId",
				email,
				role,
				invited_by as "invitedBy",
				status,
				created_at as "createdAt",
				expires_at as "expiresAt",
				accepted_at as "acceptedAt",
				revoked_at as "revokedAt"
			FROM org_invitations
			WHERE id = ${invitationId}
		`

		if (rows.length === 0) return null

		return rows[0] as OrgInvitation
	}

	/**
	 * Get invitation by token (for preview)
	 */
	async getInvitationByToken(token: string): Promise<
		| (OrgInvitation & {
				orgName: string
				orgSlug: string
				inviterName?: string
		  })
		| null
	> {
		const tokenHash = hashToken(token)

		const rows = await this.sql`
			SELECT
				i.id,
				i.org_id as "orgId",
				i.email,
				i.role,
				i.invited_by as "invitedBy",
				i.status,
				i.created_at as "createdAt",
				i.expires_at as "expiresAt",
				i.accepted_at as "acceptedAt",
				i.revoked_at as "revokedAt",
				o.name as "orgName",
				o.slug as "orgSlug",
				u.name as "inviterName"
			FROM org_invitations i
			INNER JOIN organizations o ON o.id = i.org_id
			LEFT JOIN users u ON u.id = i.invited_by
			WHERE i.token_hash = ${tokenHash}
		`

		if (rows.length === 0) return null

		return rows[0] as OrgInvitation & {
			orgName: string
			orgSlug: string
			inviterName?: string
		}
	}

	/**
	 * List invitations for an organization
	 */
	async listInvitations(
		orgId: OrgId,
		options: ListInvitationsOptions = {},
	): Promise<OrgInvitation[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		let query = this.sql`
			SELECT
				id,
				org_id as "orgId",
				email,
				role,
				invited_by as "invitedBy",
				status,
				created_at as "createdAt",
				expires_at as "expiresAt",
				accepted_at as "acceptedAt",
				revoked_at as "revokedAt"
			FROM org_invitations
			WHERE org_id = ${orgId}
		`

		if (options.status) {
			query = this.sql`
				SELECT
					id,
					org_id as "orgId",
					email,
					role,
					invited_by as "invitedBy",
					status,
					created_at as "createdAt",
					expires_at as "expiresAt",
					accepted_at as "acceptedAt",
					revoked_at as "revokedAt"
				FROM org_invitations
				WHERE org_id = ${orgId} AND status = ${options.status}
			`
		}

		const rows = await this.sql`
			${query}
			ORDER BY created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as OrgInvitation[]
	}

	/**
	 * List invitations for an email address
	 * Useful for showing pending invitations to a user
	 */
	async listInvitationsForEmail(
		email: string,
		options: ListInvitationsOptions = {},
	): Promise<
		Array<
			OrgInvitation & {
				orgName: string
				orgSlug: string
			}
		>
	> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				i.id,
				i.org_id as "orgId",
				i.email,
				i.role,
				i.invited_by as "invitedBy",
				i.status,
				i.created_at as "createdAt",
				i.expires_at as "expiresAt",
				i.accepted_at as "acceptedAt",
				i.revoked_at as "revokedAt",
				o.name as "orgName",
				o.slug as "orgSlug"
			FROM org_invitations i
			INNER JOIN organizations o ON o.id = i.org_id
			WHERE i.email = ${email}
			  AND i.status = 'pending'
			  AND i.expires_at > NOW()
			ORDER BY i.created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Array<
			OrgInvitation & {
				orgName: string
				orgSlug: string
			}
		>
	}

	/**
	 * Cleanup expired invitations
	 * Marks expired pending invitations as expired
	 */
	async cleanupExpiredInvitations(): Promise<number> {
		const result = await this.sql`
			UPDATE org_invitations
			SET status = 'expired'
			WHERE status = 'pending'
			  AND expires_at <= NOW()
			RETURNING id
		`

		this.logger.info('Expired invitations cleaned up', { count: result.length })

		return result.length
	}
}
