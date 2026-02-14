/**
 * Role Assignment Management
 * Assigns roles to users and organizations, resolves permissions
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { UserId, OrgId, PrincipalType } from '../core/types.ts'
import { MissingPermissionError } from '../core/errors.ts'

export interface AssignRoleData {
	principalType: PrincipalType
	principalId: string
	roleId: string
	orgId?: OrgId
}

export interface RemoveRoleData {
	principalType: PrincipalType
	principalId: string
	roleId: string
	orgId?: OrgId
}

export interface ResolvePermissionsOptions {
	principalType: PrincipalType
	principalId: string
	orgId?: OrgId
}

/**
 * Manages role assignments and permission resolution
 */
export class AssignmentManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Assign a role to a principal (user or org)
	 * - Can be scoped to an organization
	 * - Global roles: principalType=user, orgId=null
	 * - Org-scoped roles: principalType=user, orgId=<org-id>
	 */
	async assignRole(data: AssignRoleData): Promise<void> {
		const { principalType, principalId, roleId, orgId } = data

		this.logger.info('Assigning role', { principalType, principalId, roleId, orgId })

		// Check if already assigned
		const existing = await this.sql`
			SELECT id FROM principal_roles
			WHERE principal_type = ${principalType}
			  AND principal_id = ${principalId}
			  AND role_id = ${roleId}
			  AND org_id IS NOT DISTINCT FROM ${orgId || null}
		`

		if (existing.length > 0) {
			this.logger.debug('Role already assigned', { principalType, principalId, roleId })
			return
		}

		// Assign role
		await this.sql`
			INSERT INTO principal_roles (principal_type, principal_id, role_id, org_id, assigned_at)
			VALUES (
				${principalType},
				${principalId},
				${roleId},
				${orgId || null},
				NOW()
			)
		`

		this.logger.info('Role assigned', { principalType, principalId, roleId, orgId })
	}

	/**
	 * Remove a role from a principal
	 */
	async removeRole(data: RemoveRoleData): Promise<void> {
		const { principalType, principalId, roleId, orgId } = data

		this.logger.info('Removing role', { principalType, principalId, roleId, orgId })

		await this.sql`
			DELETE FROM principal_roles
			WHERE principal_type = ${principalType}
			  AND principal_id = ${principalId}
			  AND role_id = ${roleId}
			  AND org_id IS NOT DISTINCT FROM ${orgId || null}
		`

		this.logger.info('Role removed', { principalType, principalId, roleId, orgId })
	}

	/**
	 * Get all roles for a principal
	 */
	async getRoles(options: ResolvePermissionsOptions): Promise<
		Array<{
			roleId: string
			roleKey: string
			roleName: string
			roleWeight: number
			orgId?: string
			assignedAt: string
		}>
	> {
		const { principalType, principalId, orgId } = options

		const rows = await this.sql`
			SELECT
				pr.role_id as "roleId",
				r.key as "roleKey",
				r.name as "roleName",
				r.weight as "roleWeight",
				pr.org_id as "orgId",
				pr.assigned_at as "assignedAt"
			FROM principal_roles pr
			INNER JOIN roles r ON r.id = pr.role_id
			WHERE pr.principal_type = ${principalType}
			  AND pr.principal_id = ${principalId}
			  ${orgId ? this.sql`AND (pr.org_id = ${orgId} OR pr.org_id IS NULL)` : this.sql`AND pr.org_id IS NULL`}
			ORDER BY r.weight DESC
		`

		return rows as Array<{
			roleId: string
			roleKey: string
			roleName: string
			roleWeight: number
			orgId?: string
			assignedAt: string
		}>
	}

	/**
	 * Resolve all permissions for a principal
	 * - Combines permissions from all assigned roles
	 * - Returns unique set of permissions
	 * - Cached for performance
	 */
	async resolvePermissions(options: ResolvePermissionsOptions): Promise<string[]> {
		const { principalType, principalId, orgId } = options

		const rows = await this.sql`
			SELECT DISTINCT p.key
			FROM principal_roles pr
			INNER JOIN role_permissions rp ON rp.role_id = pr.role_id
			INNER JOIN permissions p ON p.id = rp.permission_id
			WHERE pr.principal_type = ${principalType}
			  AND pr.principal_id = ${principalId}
			  ${orgId ? this.sql`AND (pr.org_id = ${orgId} OR pr.org_id IS NULL)` : this.sql`AND pr.org_id IS NULL`}
			ORDER BY p.key
		`

		return rows.map((row: { key: string }) => row.key)
	}

	/**
	 * Check if a principal has a specific permission
	 */
	async hasPermission(
		options: ResolvePermissionsOptions,
		permissionKey: string,
	): Promise<boolean> {
		const { principalType, principalId, orgId } = options

		const rows = await this.sql`
			SELECT 1
			FROM principal_roles pr
			INNER JOIN role_permissions rp ON rp.role_id = pr.role_id
			INNER JOIN permissions p ON p.id = rp.permission_id
			WHERE pr.principal_type = ${principalType}
			  AND pr.principal_id = ${principalId}
			  AND p.key = ${permissionKey}
			  ${orgId ? this.sql`AND (pr.org_id = ${orgId} OR pr.org_id IS NULL)` : this.sql`AND pr.org_id IS NULL`}
			LIMIT 1
		`

		return rows.length > 0
	}

	/**
	 * Check if principal has any of the given permissions
	 */
	async hasAnyPermission(
		options: ResolvePermissionsOptions,
		permissionKeys: string[],
	): Promise<boolean> {
		if (permissionKeys.length === 0) return false

		const { principalType, principalId, orgId } = options

		const rows = await this.sql`
			SELECT 1
			FROM principal_roles pr
			INNER JOIN role_permissions rp ON rp.role_id = pr.role_id
			INNER JOIN permissions p ON p.id = rp.permission_id
			WHERE pr.principal_type = ${principalType}
			  AND pr.principal_id = ${principalId}
			  AND p.key = ANY(${permissionKeys})
			  ${orgId ? this.sql`AND (pr.org_id = ${orgId} OR pr.org_id IS NULL)` : this.sql`AND pr.org_id IS NULL`}
			LIMIT 1
		`

		return rows.length > 0
	}

	/**
	 * Check if principal has all of the given permissions
	 */
	async hasAllPermissions(
		options: ResolvePermissionsOptions,
		permissionKeys: string[],
	): Promise<boolean> {
		if (permissionKeys.length === 0) return true

		const { principalType, principalId, orgId } = options

		const rows = await this.sql`
			SELECT DISTINCT p.key
			FROM principal_roles pr
			INNER JOIN role_permissions rp ON rp.role_id = pr.role_id
			INNER JOIN permissions p ON p.id = rp.permission_id
			WHERE pr.principal_type = ${principalType}
			  AND pr.principal_id = ${principalId}
			  AND p.key = ANY(${permissionKeys})
			  ${orgId ? this.sql`AND (pr.org_id = ${orgId} OR pr.org_id IS NULL)` : this.sql`AND pr.org_id IS NULL`}
		`

		const grantedKeys = new Set(rows.map((row: { key: string }) => row.key))

		return permissionKeys.every((key) => grantedKeys.has(key))
	}

	/**
	 * Require permission (throws if missing)
	 * Helper for guards
	 */
	async requirePermission(
		options: ResolvePermissionsOptions,
		permissionKey: string,
	): Promise<void> {
		const hasIt = await this.hasPermission(options, permissionKey)

		if (!hasIt) {
			throw new MissingPermissionError(permissionKey)
		}
	}

	/**
	 * Require any permission (throws if missing all)
	 */
	async requireAnyPermission(
		options: ResolvePermissionsOptions,
		permissionKeys: string[],
	): Promise<void> {
		const hasAny = await this.hasAnyPermission(options, permissionKeys)

		if (!hasAny) {
			throw new MissingPermissionError(`one of: ${permissionKeys.join(', ')}`)
		}
	}

	/**
	 * Get highest role weight for a principal
	 * Useful for comparing authority levels
	 */
	async getHighestRoleWeight(options: ResolvePermissionsOptions): Promise<number> {
		const { principalType, principalId, orgId } = options

		const rows = await this.sql`
			SELECT MAX(r.weight) as "maxWeight"
			FROM principal_roles pr
			INNER JOIN roles r ON r.id = pr.role_id
			WHERE pr.principal_type = ${principalType}
			  AND pr.principal_id = ${principalId}
			  ${orgId ? this.sql`AND (pr.org_id = ${orgId} OR pr.org_id IS NULL)` : this.sql`AND pr.org_id IS NULL`}
		`

		if (rows.length === 0 || rows[0].maxWeight === null) return 0

		return rows[0].maxWeight as number
	}

	/**
	 * List all principals with a specific role
	 */
	async listPrincipalsWithRole(roleId: string, orgId?: OrgId): Promise<
		Array<{
			principalType: PrincipalType
			principalId: string
			assignedAt: string
		}>
	> {
		const rows = await this.sql`
			SELECT
				principal_type as "principalType",
				principal_id as "principalId",
				assigned_at as "assignedAt"
			FROM principal_roles
			WHERE role_id = ${roleId}
			  ${orgId ? this.sql`AND org_id = ${orgId}` : this.sql`AND org_id IS NULL`}
			ORDER BY assigned_at DESC
		`

		return rows as Array<{
			principalType: PrincipalType
			principalId: string
			assignedAt: string
		}>
	}
}
