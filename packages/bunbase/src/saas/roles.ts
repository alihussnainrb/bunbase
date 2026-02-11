import type { Permission, Role } from './types.ts'

export class RoleService {
	private roles = new Map<string, Role>()
	private permissions = new Map<string, Permission>()

	constructor() {
		// Default roles
		this.addRole({
			key: 'owner',
			name: 'Owner',
			description: 'Full access to the organization',
			permissions: ['*'],
		})
		this.addRole({
			key: 'member',
			name: 'Member',
			description: 'Standard member access',
			permissions: ['org:read'],
		})
	}

	addRole(role: Role): void {
		this.roles.set(role.key, role)
	}

	getRole(key: string): Role | undefined {
		return this.roles.get(key)
	}

	hasPermission(roleKey: string, permission: string): boolean {
		const role = this.roles.get(roleKey)
		if (!role) return false
		if (role.permissions.includes('*')) return true
		return role.permissions.includes(permission)
	}
}

export const defaultRoleService: RoleService = new RoleService()
