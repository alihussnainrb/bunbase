import type { Organization, OrgMembership } from './types.ts'

export class OrganizationService {
    constructor(private readonly db: any) { }

    async create(userId: string, name: string, slug: string): Promise<Organization> {
        const [org] = await this.db
            .from('organizations')
            .insert({
                name,
                slug,
                owner_id: userId,
            })
            .returning()

        // Add owner as member with 'owner' role
        await this.addMember(org.id, userId, 'owner')

        return org
    }

    async getById(id: string): Promise<Organization | null> {
        const org = await this.db
            .from('organizations')
            .where({ id })
            .first()
        return org || null
    }

    async addMember(orgId: string, userId: string, role: string = 'member'): Promise<OrgMembership> {
        const [membership] = await this.db
            .from('org_memberships')
            .insert({
                org_id: orgId,
                user_id: userId,
                role,
            })
            .returning()
        return membership
    }

    async getMembership(orgId: string, userId: string): Promise<OrgMembership | null> {
        const membership = await this.db
            .from('org_memberships')
            .where({ org_id: orgId, user_id: userId })
            .first()
        return membership || null
    }

    async getMemberRole(orgId: string, userId: string): Promise<string | null> {
        const membership = await this.getMembership(orgId, userId)
        return membership ? membership.role : null
    }
}
