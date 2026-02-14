/**
 * Permission Management
 * CRUD operations for permissions in the RBAC system
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { Permission } from '../core/types.ts'
import { PermissionNotFoundError } from '../core/errors.ts'

export interface CreatePermissionData {
	key: string
	name: string
	description?: string
}

export interface UpdatePermissionData {
	name?: string
	description?: string
}

export interface ListPermissionsOptions {
	limit?: number
	offset?: number
}

/**
 * Manages permissions in the RBAC system
 */
export class PermissionManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Create a new permission
	 * - Key must be unique (e.g., 'org:read', 'billing:manage')
	 */
	async create(data: CreatePermissionData): Promise<Permission> {
		this.logger.info('Creating permission', { key: data.key })

		try {
			const rows = await this.sql`
				INSERT INTO permissions (key, name, description, created_at)
				VALUES (
					${data.key},
					${data.name},
					${data.description || null},
					NOW()
				)
				RETURNING id, key, name, description, created_at as "createdAt"
			`

			const permission = rows[0] as Permission

			this.logger.info('Permission created', { id: permission.id, key: data.key })

			return permission
		} catch (err) {
			this.logger.error('Failed to create permission', { error: err })
			throw err
		}
	}

	/**
	 * Get permission by ID
	 */
	async get(permissionId: string): Promise<Permission | null> {
		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				description,
				created_at as "createdAt"
			FROM permissions
			WHERE id = ${permissionId}
		`

		if (rows.length === 0) return null

		return rows[0] as Permission
	}

	/**
	 * Get permission by key
	 */
	async getByKey(key: string): Promise<Permission | null> {
		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				description,
				created_at as "createdAt"
			FROM permissions
			WHERE key = ${key}
		`

		if (rows.length === 0) return null

		return rows[0] as Permission
	}

	/**
	 * Update permission
	 */
	async update(permissionId: string, data: UpdatePermissionData): Promise<Permission> {
		const permission = await this.get(permissionId)
		if (!permission) throw new PermissionNotFoundError(permissionId)

		const updates: string[] = []
		const values: unknown[] = []

		if (data.name !== undefined) {
			updates.push(`name = $${updates.length + 1}`)
			values.push(data.name)
		}

		if (data.description !== undefined) {
			updates.push(`description = $${updates.length + 1}`)
			values.push(data.description)
		}

		if (updates.length === 0) {
			// No updates needed
			return permission
		}

		values.push(permissionId)

		const sql = `UPDATE permissions SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`

		const rows = await this.sql.unsafe(sql, values)

		this.logger.info('Permission updated', { permissionId, updates: Object.keys(data) })

		const updated = rows[0] as {
			id: string
			key: string
			name: string
			description: string
			created_at: string
		}

		return {
			id: updated.id,
			key: updated.key,
			name: updated.name,
			description: updated.description,
			createdAt: new Date(updated.created_at),
		}
	}

	/**
	 * Delete permission
	 * - Cascades to role_permissions and principal_permissions
	 */
	async delete(permissionId: string): Promise<void> {
		const permission = await this.get(permissionId)
		if (!permission) throw new PermissionNotFoundError(permissionId)

		await this.sql`DELETE FROM permissions WHERE id = ${permissionId}`

		this.logger.info('Permission deleted', { permissionId })
	}

	/**
	 * List all permissions
	 */
	async list(options: ListPermissionsOptions = {}): Promise<Permission[]> {
		const limit = options.limit || 100
		const offset = options.offset || 0

		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				description,
				created_at as "createdAt"
			FROM permissions
			ORDER BY name
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows as Permission[]
	}

	/**
	 * Assign permission to role
	 */
	async assignToRole(permissionId: string, roleId: string): Promise<void> {
		this.logger.info('Assigning permission to role', { permissionId, roleId })

		// Verify permission and role exist
		const permission = await this.get(permissionId)
		if (!permission) throw new PermissionNotFoundError(permissionId)

		const roleExists = await this.sql`SELECT id FROM roles WHERE id = ${roleId}`
		if (roleExists.length === 0) {
			throw new Error('Role not found')
		}

		// Check if already assigned
		const existing = await this.sql`
			SELECT 1 FROM role_permissions
			WHERE role_id = ${roleId} AND permission_id = ${permissionId}
		`

		if (existing.length > 0) {
			// Already assigned, skip
			return
		}

		await this.sql`
			INSERT INTO role_permissions (role_id, permission_id)
			VALUES (${roleId}, ${permissionId})
		`

		this.logger.info('Permission assigned to role', { permissionId, roleId })
	}

	/**
	 * Remove permission from role
	 */
	async removeFromRole(permissionId: string, roleId: string): Promise<void> {
		this.logger.info('Removing permission from role', { permissionId, roleId })

		await this.sql`
			DELETE FROM role_permissions
			WHERE role_id = ${roleId} AND permission_id = ${permissionId}
		`

		this.logger.info('Permission removed from role', { permissionId, roleId })
	}

	/**
	 * Get all permissions for a role
	 */
	async getPermissionsForRole(roleId: string): Promise<Permission[]> {
		const rows = await this.sql`
			SELECT
				p.id,
				p.key,
				p.name,
				p.description,
				p.created_at as "createdAt"
			FROM permissions p
			INNER JOIN role_permissions rp ON rp.permission_id = p.id
			WHERE rp.role_id = ${roleId}
			ORDER BY p.name
		`

		return rows as Permission[]
	}

	/**
	 * Get all roles that have a permission
	 */
	async getRolesWithPermission(permissionId: string): Promise<
		Array<{
			id: string
			key: string
			name: string
			weight: number
		}>
	> {
		const rows = await this.sql`
			SELECT
				r.id,
				r.key,
				r.name,
				r.weight
			FROM roles r
			INNER JOIN role_permissions rp ON rp.role_id = r.id
			WHERE rp.permission_id = ${permissionId}
			ORDER BY r.weight DESC
		`

		return rows as Array<{
			id: string
			key: string
			name: string
			weight: number
		}>
	}
}
