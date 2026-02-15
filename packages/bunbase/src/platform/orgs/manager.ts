/**
 * Organization Management
 * Core CRUD operations for organizations
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type {
	OrgId,
	Organization,
	UserId,
	OrgMembership,
} from '../core/types.ts'
import {
	OrgNotFoundError,
	OrgSlugTakenError,
	NotOrgMemberError,
	InsufficientOrgRoleError,
	CannotRemoveLastOwnerError,
} from '../core/errors.ts'
import { newOrgId, generateSlug, generateUniqueSlug } from '../core/ids.ts'

export interface CreateOrgData {
	name: string
	slug?: string
	ownerId: UserId
	metadata?: Record<string, unknown>
}

export interface UpdateOrgData {
	name?: string
	slug?: string
	metadata?: Record<string, unknown>
}

export interface ListOrgsOptions {
	userId?: UserId
	limit?: number
	offset?: number
}

export interface TransferOwnershipData {
	orgId: OrgId
	currentOwnerId: UserId
	newOwnerId: UserId
}

/**
 * Manages organization lifecycle and metadata
 */
export class OrganizationManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Create a new organization
	 * - Generates slug from name if not provided
	 * - Ensures slug uniqueness
	 * - Automatically creates owner membership
	 */
	async create(data: CreateOrgData): Promise<Organization> {
		this.logger.info('Creating organization', { name: data.name })

		// Generate or validate slug
		let slug = data.slug || generateSlug(data.name)

		// Check if slug is taken
		const existing = await this.sql`
			SELECT id FROM organizations WHERE slug = ${slug}
		`

		if (existing.length > 0) {
			if (data.slug) {
				// User provided slug explicitly - reject
				throw new OrgSlugTakenError(slug)
			}
			// Auto-generate unique slug
			slug = generateUniqueSlug(slug)
		}

		const orgId = newOrgId()

		try {
			await this.sql.begin(async (tx) => {
				// Create organization
				await tx`
					INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
					VALUES (
						${orgId},
						${data.name},
						${slug},
						${data.ownerId},
						NOW(),
						NOW()
					)
				`

				// Create owner membership
				await tx`
					INSERT INTO org_memberships (org_id, user_id, role, joined_at)
					VALUES (${orgId}, ${data.ownerId}, 'owner', NOW())
				`
			})

			this.logger.info('Organization created', { orgId, slug })

			return {
				id: orgId,
				name: data.name,
				slug,
				ownerId: data.ownerId,
				avatarUrl: null,
				metadata: {},
				createdAt: new Date(),
				updatedAt: new Date(),
				deletedAt: null,
			}
		} catch (err) {
			this.logger.error('Failed to create organization', { error: err })
			throw err
		}
	}

	/**
	 * Get organization by ID
	 */
	async get(orgId: OrgId): Promise<Organization | null> {
		const rows = await this.sql`
			SELECT
				id,
				name,
				slug,
				owner_id as "ownerId",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM organizations
			WHERE id = ${orgId}
		`

		if (rows.length === 0) return null

		return rows[0] as Organization
	}

	/**
	 * Get organization by slug
	 */
	async getBySlug(slug: string): Promise<Organization | null> {
		const rows = await this.sql`
			SELECT
				id,
				name,
				slug,
				owner_id as "ownerId",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM organizations
			WHERE slug = ${slug}
		`

		if (rows.length === 0) return null

		return rows[0] as Organization
	}

	/**
	 * Update organization
	 * - Only owner can update
	 * - Slug changes must maintain uniqueness
	 */
	async update(orgId: OrgId, data: UpdateOrgData): Promise<Organization> {
		const org = await this.get(orgId)
		if (!org) throw new OrgNotFoundError(orgId)

		// Check slug uniqueness if changing
		if (data.slug && data.slug !== org.slug) {
			const existing = await this.sql`
				SELECT id FROM organizations WHERE slug = ${data.slug} AND id != ${orgId}
			`
			if (existing.length > 0) {
				throw new OrgSlugTakenError(data.slug)
			}
		}

		const updates: string[] = []
		const values: unknown[] = []

		if (data.name !== undefined) {
			updates.push(`name = $${updates.length + 1}`)
			values.push(data.name)
		}

		if (data.slug !== undefined) {
			updates.push(`slug = $${updates.length + 1}`)
			values.push(data.slug)
		}

		if (updates.length === 0) {
			// No updates needed
			return org
		}

		updates.push('updated_at = NOW()')
		values.push(orgId)

		const sql = `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`

		const rows = await this.sql.unsafe(sql, values)

		this.logger.info('Organization updated', { orgId, updates: Object.keys(data) })

		const updated = rows[0] as {
			id: string
			name: string
			slug: string
			owner_id: string
			created_at: string
			updated_at: string
		}

		return {
			id: updated.id as OrgId,
			name: updated.name,
			slug: updated.slug,
			ownerId: updated.owner_id as UserId,
			avatarUrl: null,
			metadata: {},
			createdAt: new Date(updated.created_at),
			updatedAt: new Date(updated.updated_at),
			deletedAt: null,
		}
	}

	/**
	 * Delete organization
	 * - Only owner can delete
	 * - Cascades to memberships, invitations, subscriptions
	 */
	async delete(orgId: OrgId): Promise<void> {
		const org = await this.get(orgId)
		if (!org) throw new OrgNotFoundError(orgId)

		await this.sql`DELETE FROM organizations WHERE id = ${orgId}`

		this.logger.info('Organization deleted', { orgId })
	}

	/**
	 * List organizations for a user
	 * Returns orgs where user is a member (any role)
	 */
	async listForUser(userId: UserId, options: ListOrgsOptions = {}): Promise<Organization[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				o.id,
				o.name,
				o.slug,
				o.owner_id as "ownerId",
				o.created_at as "createdAt",
				o.updated_at as "updatedAt"
			FROM organizations o
			INNER JOIN org_memberships m ON m.org_id = o.id
			WHERE m.user_id = ${userId}
			ORDER BY o.created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Organization[]
	}

	/**
	 * List all organizations (admin only)
	 */
	async list(options: ListOrgsOptions = {}): Promise<Organization[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				id,
				name,
				slug,
				owner_id as "ownerId",
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM organizations
			ORDER BY created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Organization[]
	}

	/**
	 * Transfer ownership to another member
	 * - New owner must be an existing member
	 * - Updates both owner_id and membership role
	 * - Previous owner becomes admin
	 */
	async transferOwnership(data: TransferOwnershipData): Promise<void> {
		const { orgId, currentOwnerId, newOwnerId } = data

		const org = await this.get(orgId)
		if (!org) throw new OrgNotFoundError(orgId)

		if (org.ownerId !== currentOwnerId) {
			throw new InsufficientOrgRoleError('Only the current owner can transfer ownership')
		}

		// Check if new owner is a member
		const newOwnerMembership = await this.sql`
			SELECT id FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${newOwnerId}
		`

		if (newOwnerMembership.length === 0) {
			throw new NotOrgMemberError(orgId, { newOwnerId })
		}

		await this.sql.begin(async (tx) => {
			// Update organization owner_id
			await tx`
				UPDATE organizations
				SET owner_id = ${newOwnerId}, updated_at = NOW()
				WHERE id = ${orgId}
			`

			// Update new owner's membership role
			await tx`
				UPDATE org_memberships
				SET role = 'owner'
				WHERE org_id = ${orgId} AND user_id = ${newOwnerId}
			`

			// Downgrade previous owner to admin
			await tx`
				UPDATE org_memberships
				SET role = 'admin'
				WHERE org_id = ${orgId} AND user_id = ${currentOwnerId}
			`
		})

		this.logger.info('Ownership transferred', { orgId, from: currentOwnerId, to: newOwnerId })
	}

	/**
	 * Check if user is a member of organization
	 */
	async isMember(orgId: OrgId, userId: UserId): Promise<boolean> {
		const rows = await this.sql`
			SELECT id FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${userId}
		`

		return rows.length > 0
	}

	/**
	 * Get user's role in organization
	 */
	async getUserRole(orgId: OrgId, userId: UserId): Promise<string | null> {
		const rows = await this.sql`
			SELECT role FROM org_memberships
			WHERE org_id = ${orgId} AND user_id = ${userId}
		`

		if (rows.length === 0) return null

		return (rows[0] as { role: string }).role
	}

	/**
	 * Check if user is owner of organization
	 */
	async isOwner(orgId: OrgId, userId: UserId): Promise<boolean> {
		const org = await this.get(orgId)
		return org?.ownerId === userId
	}
}
