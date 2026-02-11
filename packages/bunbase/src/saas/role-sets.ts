export class RoleSetService {
	// Plan Key -> Role Keys
	private planRoles = new Map<string, string[]>()

	constructor() {
		// Defaults
		this.setRolesForPlan('free', ['owner', 'member'])
		this.setRolesForPlan('pro', ['owner', 'admin', 'member', 'analyst'])
		this.setRolesForPlan('enterprise', [
			'owner',
			'admin',
			'member',
			'analyst',
			'security_admin',
		])
	}

	setRolesForPlan(planKey: string, roleKeys: string[]): void {
		this.planRoles.set(planKey, roleKeys)
	}

	getRolesForPlan(planKey: string): string[] {
		return this.planRoles.get(planKey) || ['owner', 'member']
	}
}

export const defaultRoleSetService: RoleSetService = new RoleSetService()
