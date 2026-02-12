import type { DatabaseClient } from '../db/client.ts'
import type { Logger } from '../logger/index.ts'
import { RoleManager } from './role-manager.ts'

/**
 * In-memory cache for role permissions (TTL: 5 minutes)
 * Maps roleKey -> { permissions: string[], expiresAt: number }
 */
const permissionCache = new Map<
	string,
	{ permissions: string[]; expiresAt: number }
>()

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface IAMContext {
	/**
	 * Check if the current user has a specific permission.
	 * Queries database on first call, then caches for 5 minutes.
	 *
	 * @example
	 * const { allowed, reason } = await ctx.iam.can('article:publish')
	 * if (!allowed) throw new Forbidden(reason)
	 */
	can: (permission: string) => Promise<{ allowed: boolean; reason?: string }>

	/**
	 * Batch check multiple permissions at once
	 *
	 * @example
	 * const results = await ctx.iam.canAll(['article:publish', 'article:delete'])
	 * // Map { 'article:publish' => true, 'article:delete' => false }
	 */
	canAll: (permissions: string[]) => Promise<Map<string, boolean>>

	/**
	 * RoleManager instance for admin operations (create/update roles/permissions)
	 *
	 * @example
	 * await ctx.iam.roles.createRole({ key: 'moderator', name: 'Moderator', weight: 50 })
	 * await ctx.iam.roles.assignPermission('moderator', 'article:approve')
	 */
	roles: RoleManager

	/**
	 * Invalidate permission cache for a specific role or all roles
	 *
	 * @example
	 * await ctx.iam.invalidateCache('editor') // After changing editor permissions
	 */
	invalidateCache: (roleKey?: string) => void
}

export interface CreateIAMContextOptions {
	db: DatabaseClient
	roleKey?: string // Current user's role (from ctx.auth.role)
	logger: Logger
}

/**
 * Creates an IAM context with lazy-loaded, cached permission checks.
 * Only queries database when can() is called, and caches results for 5 minutes.
 */
export function createIAMContext(opts: CreateIAMContextOptions): IAMContext {
	const roleManager = new RoleManager(opts.db)
	const roleKey = opts.roleKey

	/**
	 * Fetch permissions for the current role (with caching)
	 */
	const getRolePermissions = async (): Promise<string[]> => {
		if (!roleKey) {
			return []
		}

		// Check cache
		const cached = permissionCache.get(roleKey)
		if (cached && cached.expiresAt > Date.now()) {
			return cached.permissions
		}

		// Cache miss - query database
		try {
			const permissions = await roleManager.getRolePermissions(roleKey)

			// Cache result
			permissionCache.set(roleKey, {
				permissions,
				expiresAt: Date.now() + CACHE_TTL_MS,
			})

			return permissions
		} catch (err) {
			opts.logger.error('Failed to fetch role permissions', {
				roleKey,
				error: err instanceof Error ? err.message : String(err),
			})
			return []
		}
	}

	return {
		can: async (permission: string) => {
			if (!roleKey) {
				return {
					allowed: false,
					reason: 'User not authenticated or role not set',
				}
			}

			const permissions = await getRolePermissions()

			// Check for wildcard permission (superadmin)
			if (permissions.includes('*')) {
				return { allowed: true }
			}

			// Check specific permission
			if (permissions.includes(permission)) {
				return { allowed: true }
			}

			// Check namespace wildcard (e.g., 'article:*' allows 'article:publish')
			const namespace = permission.split(':')[0]
			if (permissions.includes(`${namespace}:*`)) {
				return { allowed: true }
			}

			return {
				allowed: false,
				reason: `Missing permission: ${permission}`,
			}
		},

		canAll: async (permissions: string[]) => {
			const rolePermissions = await getRolePermissions()
			const results = new Map<string, boolean>()

			for (const permission of permissions) {
				// Check wildcard
				if (rolePermissions.includes('*')) {
					results.set(permission, true)
					continue
				}

				// Check specific permission
				if (rolePermissions.includes(permission)) {
					results.set(permission, true)
					continue
				}

				// Check namespace wildcard
				const namespace = permission.split(':')[0]
				if (rolePermissions.includes(`${namespace}:*`)) {
					results.set(permission, true)
					continue
				}

				results.set(permission, false)
			}

			return results
		},

		roles: roleManager,

		invalidateCache: (roleKeyToInvalidate?: string) => {
			if (roleKeyToInvalidate) {
				permissionCache.delete(roleKeyToInvalidate)
			} else {
				permissionCache.clear()
			}
		},
	}
}
