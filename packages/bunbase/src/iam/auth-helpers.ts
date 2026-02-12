import type { DatabaseClient } from '../db/client.ts'
import { RoleManager } from './role-manager.ts'

/**
 * Resolve permissions for a user's role.
 * Call this during login/session creation to populate ctx.auth.permissions.
 *
 * @example
 * // In login action:
 * const permissions = await resolvePermissions(ctx.db, 'org:admin')
 * await createSession(userId, { role: 'org:admin', permissions })
 */
export async function resolvePermissions(
	db: DatabaseClient,
	roleKey: string,
): Promise<string[]> {
	const roleManager = new RoleManager(db)

	try {
		const permissions = await roleManager.getRolePermissions(roleKey)
		return permissions
	} catch (err) {
		// If role not found or DB error, return empty array
		console.error('Failed to resolve permissions:', err)
		return []
	}
}

/**
 * Build full auth context for session creation.
 * Resolves permissions from database and returns everything needed for ctx.auth.
 *
 * @example
 * // In login action:
 * const authContext = await buildAuthContext(ctx.db, {
 *   userId: user.id,
 *   orgId: membership.org_id,
 *   role: membership.role
 * })
 * await createSession(user.id, authContext)
 */
export async function buildAuthContext(
	db: DatabaseClient,
	data: {
		userId: string
		orgId?: string
		role?: string
	},
): Promise<{
	userId: string
	orgId?: string
	role?: string
	permissions: string[]
}> {
	const permissions = data.role ? await resolvePermissions(db, data.role) : []

	return {
		userId: data.userId,
		orgId: data.orgId,
		role: data.role,
		permissions,
	}
}

/**
 * Check if a permissions array includes a specific permission.
 * Supports namespace wildcards (e.g., 'article:*' matches 'article:publish').
 *
 * @example
 * const permissions = ['article:*', 'users:read']
 * hasPermission(permissions, 'article:publish') // true
 * hasPermission(permissions, 'users:delete')    // false
 */
export function hasPermission(
	permissions: string[],
	permission: string,
): boolean {
	// Check for superadmin wildcard
	if (permissions.includes('*')) {
		return true
	}

	// Check specific permission
	if (permissions.includes(permission)) {
		return true
	}

	// Check namespace wildcard (e.g., 'article:*' allows 'article:publish')
	const namespace = permission.split(':')[0]
	if (permissions.includes(`${namespace}:*`)) {
		return true
	}

	return false
}
