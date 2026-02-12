import type { DatabaseClient } from '../db/client.ts'

export interface Role {
	id: string
	key: string
	name: string
	description: string | null
	weight: number
	created_at: Date
}

export interface Permission {
	id: string
	key: string
	name: string
	description: string | null
	created_at: Date
}

export interface RolePermission {
	role_id: string
	permission_id: string
}

/**
 * Service for managing roles and permissions dynamically in the database.
 * Used by admin actions to create/update roles without code changes.
 */
export class RoleManager {
	constructor(private readonly db: DatabaseClient) {}

	// ── Roles ──────────────────────────────────────────────

	async createRole(data: {
		key: string
		name: string
		description?: string
		weight?: number
	}): Promise<Role> {
		const role = await this.db.from('roles').insert({
			key: data.key,
			name: data.name,
			description: data.description ?? null,
			weight: data.weight ?? 0,
		})
		return role as Role
	}

	async getRole(key: string): Promise<Role | null> {
		const role = await this.db.from('roles').eq('key', key).maybeSingle()
		return role as Role | null
	}

	async getAllRoles(): Promise<Role[]> {
		const roles = await this.db.from('roles').orderBy('weight', 'DESC').exec()
		return roles as Role[]
	}

	async updateRole(
		key: string,
		data: Partial<Pick<Role, 'name' | 'description' | 'weight'>>,
	): Promise<Role> {
		const [role] = await this.db.from('roles').eq('key', key).update(data)
		return role as Role
	}

	async deleteRole(key: string): Promise<void> {
		await this.db.from('roles').eq('key', key).delete()
	}

	// ── Permissions ────────────────────────────────────────

	async createPermission(data: {
		key: string
		name: string
		description?: string
	}): Promise<Permission> {
		const permission = await this.db.from('permissions').insert({
			key: data.key,
			name: data.name,
			description: data.description ?? null,
		})
		return permission as Permission
	}

	async getPermission(key: string): Promise<Permission | null> {
		const permission = await this.db
			.from('permissions')
			.eq('key', key)
			.maybeSingle()
		return permission as Permission | null
	}

	async getAllPermissions(): Promise<Permission[]> {
		const permissions = await this.db
			.from('permissions')
			.orderBy('key', 'ASC')
			.exec()
		return permissions as Permission[]
	}

	async deletePermission(key: string): Promise<void> {
		await this.db.from('permissions').eq('key', key).delete()
	}

	// ── Role-Permission Mapping ────────────────────────────

	/**
	 * Assign a permission to a role
	 */
	async assignPermission(
		roleKey: string,
		permissionKey: string,
	): Promise<void> {
		// Get IDs
		const role = await this.getRole(roleKey)
		const permission = await this.getPermission(permissionKey)

		if (!role) throw new Error(`Role not found: ${roleKey}`)
		if (!permission) throw new Error(`Permission not found: ${permissionKey}`)

		// Insert mapping (idempotent with ON CONFLICT DO NOTHING)
		await this.db.from('role_permissions').insert({
			role_id: role.id,
			permission_id: permission.id,
		})
	}

	/**
	 * Remove a permission from a role
	 */
	async revokePermission(
		roleKey: string,
		permissionKey: string,
	): Promise<void> {
		const role = await this.getRole(roleKey)
		const permission = await this.getPermission(permissionKey)

		if (!role || !permission) return

		await this.db
			.from('role_permissions')
			.eq('role_id', role.id)
			.eq('permission_id', permission.id)
			.delete()
	}

	/**
	 * Get all permissions for a role (with caching support)
	 */
	async getRolePermissions(roleKey: string): Promise<string[]> {
		const result = (await this.db.raw`
			SELECT p.key as permission_key
			FROM role_permissions rp
			JOIN roles r ON rp.role_id = r.id
			JOIN permissions p ON rp.permission_id = p.id
			WHERE r.key = ${roleKey}
		`) as { permission_key: string }[]

		return result.map((row) => row.permission_key)
	}

	/**
	 * Check if a role has a specific permission
	 */
	async hasPermission(
		roleKey: string,
		permissionKey: string,
	): Promise<boolean> {
		const permissions = await this.getRolePermissions(roleKey)
		return permissions.includes(permissionKey)
	}

	/**
	 * Set all permissions for a role (replaces existing)
	 */
	async setRolePermissions(
		roleKey: string,
		permissionKeys: string[],
	): Promise<void> {
		const role = await this.getRole(roleKey)
		if (!role) throw new Error(`Role not found: ${roleKey}`)

		// Delete existing permissions
		await this.db.from('role_permissions').eq('role_id', role.id).delete()

		// Insert new permissions
		for (const permKey of permissionKeys) {
			await this.assignPermission(roleKey, permKey)
		}
	}
}
