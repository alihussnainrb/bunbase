/**
 * Role Management
 * CRUD operations for roles in the RBAC system
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { Role, RoleId } from '../core/types.ts'
import { RoleNotFoundError } from '../core/errors.ts'
import { newRoleId } from '../core/ids.ts'

export interface CreateRoleData {
	key: string
	name: string
	description?: string
	weight?: number
}

export interface UpdateRoleData {
	name?: string
	description?: string
	weight?: number
}

export interface ListRolesOptions {
	limit?: number
	offset?: number
	orderBy?: 'weight' | 'name' | 'created_at'
	orderDirection?: 'asc' | 'desc'
}

/**
 * Manages roles in the RBAC system
 */
export class RoleManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Create a new role
	 * - Key must be unique (e.g., 'org:admin', 'billing:manager')
	 * - Weight determines hierarchy (higher = more powerful)
	 */
	async create(data: CreateRoleData): Promise<Role> {
		this.logger.info('Creating role', { key: data.key })

		const roleId = newRoleId()

		try {
			await this.sql`
				INSERT INTO roles (id, key, name, description, weight, created_at)
				VALUES (
					${roleId},
					${data.key},
					${data.name},
					${data.description || null},
					${data.weight || 0},
					NOW()
				)
			`

			this.logger.info('Role created', { roleId, key: data.key })

			return {
				id: roleId,
				key: data.key,
				name: data.name,
				description: data.description,
				weight: data.weight || 0,
				createdAt: new Date().toISOString(),
			}
		} catch (err) {
			this.logger.error('Failed to create role', { error: err })
			throw err
		}
	}

	/**
	 * Get role by ID
	 */
	async get(roleId: RoleId): Promise<Role | null> {
		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				description,
				weight,
				created_at as "createdAt"
			FROM roles
			WHERE id = ${roleId}
		`

		if (rows.length === 0) return null

		return rows[0] as Role
	}

	/**
	 * Get role by key
	 */
	async getByKey(key: string): Promise<Role | null> {
		const rows = await this.sql`
			SELECT
				id,
				key,
				name,
				description,
				weight,
				created_at as "createdAt"
			FROM roles
			WHERE key = ${key}
		`

		if (rows.length === 0) return null

		return rows[0] as Role
	}

	/**
	 * Update role
	 */
	async update(roleId: RoleId, data: UpdateRoleData): Promise<Role> {
		const role = await this.get(roleId)
		if (!role) throw new RoleNotFoundError(roleId)

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

		if (data.weight !== undefined) {
			updates.push(`weight = $${updates.length + 1}`)
			values.push(data.weight)
		}

		if (updates.length === 0) {
			// No updates needed
			return role
		}

		values.push(roleId)

		const sql = `UPDATE roles SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`

		const rows = await this.sql.unsafe(sql, values)

		this.logger.info('Role updated', { roleId, updates: Object.keys(data) })

		const updated = rows[0] as {
			id: string
			key: string
			name: string
			description: string
			weight: number
			created_at: string
		}

		return {
			id: updated.id as RoleId,
			key: updated.key,
			name: updated.name,
			description: updated.description,
			weight: updated.weight,
			createdAt: updated.created_at,
		}
	}

	/**
	 * Delete role
	 * - Cascades to role_permissions and principal_roles
	 */
	async delete(roleId: RoleId): Promise<void> {
		const role = await this.get(roleId)
		if (!role) throw new RoleNotFoundError(roleId)

		await this.sql`DELETE FROM roles WHERE id = ${roleId}`

		this.logger.info('Role deleted', { roleId })
	}

	/**
	 * List all roles
	 */
	async list(options: ListRolesOptions = {}): Promise<Role[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0
		const orderBy = options.orderBy || 'weight'
		const orderDirection = options.orderDirection || 'desc'

		const orderColumn = orderBy === 'created_at' ? 'created_at' : orderBy

		const rows = await this.sql.unsafe(
			`
			SELECT
				id,
				key,
				name,
				description,
				weight,
				created_at as "createdAt"
			FROM roles
			ORDER BY ${orderColumn} ${orderDirection.toUpperCase()}
			LIMIT $1
			OFFSET $2
		`,
			[limit, offset],
		)

		return rows as Role[]
	}

	/**
	 * Get roles with their permissions
	 */
	async getRoleWithPermissions(roleId: RoleId): Promise<
		| (Role & {
				permissions: Array<{
					id: string
					key: string
					name: string
					description?: string
				}>
		  })
		| null
	> {
		const role = await this.get(roleId)
		if (!role) return null

		const permissionRows = await this.sql`
			SELECT
				p.id,
				p.key,
				p.name,
				p.description
			FROM permissions p
			INNER JOIN role_permissions rp ON rp.permission_id = p.id
			WHERE rp.role_id = ${roleId}
			ORDER BY p.name
		`

		return {
			...role,
			permissions: permissionRows as Array<{
				id: string
				key: string
				name: string
				description?: string
			}>,
		}
	}

	/**
	 * Check if a role has sufficient weight
	 * Helper for authorization checks
	 */
	async hasWeight(roleKey: string, minimumWeight: number): Promise<boolean> {
		const role = await this.getByKey(roleKey)
		if (!role) return false

		return role.weight >= minimumWeight
	}

	/**
	 * Compare role weights
	 * Returns true if role1 has higher or equal weight than role2
	 */
	async compareRoles(role1Key: string, role2Key: string): Promise<boolean> {
		const [role1, role2] = await Promise.all([this.getByKey(role1Key), this.getByKey(role2Key)])

		if (!role1 || !role2) return false

		return role1.weight >= role2.weight
	}
}
