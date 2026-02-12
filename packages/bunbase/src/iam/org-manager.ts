import type { DatabaseClient } from '../db/client.ts'
import type { Organization, OrgMembership } from './types.ts'

/**
 * Manages organizations and memberships.
 * All data is database-backed — no in-memory defaults.
 */
export class OrgManager {
	constructor(private readonly db: DatabaseClient) {}

	/**
	 * Create a new organization and add the creator as owner.
	 */
	async create(
		userId: string,
		name: string,
		slug: string,
	): Promise<Organization> {
		const org = await this.db.from('organizations').insert({
			name,
			slug,
			owner_id: userId,
		})

		// Add owner as member with 'owner' role
		await this.addMember(org!.id, userId, 'owner')

		return org as unknown as Organization
	}

	/**
	 * Get an organization by ID.
	 */
	async getById(id: string): Promise<Organization | null> {
		const org = await this.db.from('organizations').eq('id', id).maybeSingle()
		return org as Organization | null
	}

	/**
	 * Add a member to an organization.
	 */
	async addMember(
		orgId: string,
		userId: string,
		role: string = 'member',
	): Promise<OrgMembership> {
		const membership = await this.db.from('org_memberships').insert({
			org_id: orgId,
			user_id: userId,
			role,
		})
		return membership as unknown as OrgMembership
	}

	/**
	 * Get a user's membership in an organization.
	 */
	async getMembership(
		orgId: string,
		userId: string,
	): Promise<OrgMembership | null> {
		const membership = await this.db
			.from('org_memberships')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.maybeSingle()
		return membership as OrgMembership | null
	}

	/**
	 * Get a user's role in an organization.
	 */
	async getMemberRole(orgId: string, userId: string): Promise<string | null> {
		const membership = await this.getMembership(orgId, userId)
		return membership ? membership.role : null
	}

	/**
	 * Get the member count of an organization.
	 */
	async getMemberCount(orgId: string): Promise<number> {
		const rows = await this.db
			.from('org_memberships')
			.eq('org_id', orgId)
			.select('id')
			.exec()
		return rows.length
	}

	/**
	 * Remove a member from an organization.
	 */
	async removeMember(orgId: string, userId: string): Promise<void> {
		await this.db
			.from('org_memberships')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.delete()
	}
}
