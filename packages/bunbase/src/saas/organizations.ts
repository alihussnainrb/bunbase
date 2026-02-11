import type { Organization, OrgMembership } from './types.ts'

export class OrganizationService {
	constructor(private readonly db: any) {}

	async create(
		userId: string,
		name: string,
		slug: string,
	): Promise<Organization> {
		const org = await this.db
			.from('organizations')
			.insert({
				name,
				slug,
				owner_id: userId,
			})

		// Add owner as member with 'owner' role
		await this.addMember(org.id, userId, 'owner')

		return org
	}

	async getById(id: string): Promise<Organization | null> {
		return this.db.from('organizations').eq('id', id).single()
	}

	async addMember(
		orgId: string,
		userId: string,
		role: string = 'member',
	): Promise<OrgMembership> {
		return this.db
			.from('org_memberships')
			.insert({
				org_id: orgId,
				user_id: userId,
				role,
			})
	}

	async getMembership(
		orgId: string,
		userId: string,
	): Promise<OrgMembership | null> {
		return this.db
			.from('org_memberships')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.single()
	}

	async getMemberRole(orgId: string, userId: string): Promise<string | null> {
		const membership = await this.getMembership(orgId, userId)
		return membership ? membership.role : null
	}

	async getMemberCount(orgId: string): Promise<number> {
		const rows = await this.db
			.from('org_memberships')
			.eq('org_id', orgId)
			.select('id')
			.exec()
		return rows.length
	}
}
