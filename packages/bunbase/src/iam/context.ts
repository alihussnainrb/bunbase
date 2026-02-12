import type { DatabaseClient } from '../db/client.ts'
import type { Logger } from '../logger/index.ts'
import { OrgManager } from './org-manager.ts'
import { RoleManager } from './role-manager.ts'
import { SubscriptionManager } from './subscription-manager.ts'
import { UsersManager } from './users-manager.ts'

/**
 * IAM Manager — admin/management interface for roles, orgs, and subscriptions.
 * Accessed via ctx.iam in action handlers.
 */
export interface IAMManager {
	/**
	 * RoleManager for creating/managing roles and permissions.
	 *
	 * @example
	 * await ctx.iam.roles.createRole({ key: 'moderator', name: 'Moderator', weight: 50 })
	 * await ctx.iam.roles.assignPermission('moderator', 'article:approve')
	 */
	roles: RoleManager

	/**
	 * OrgManager for creating/managing organizations and memberships.
	 *
	 * @example
	 * const org = await ctx.iam.orgs.create(userId, 'Acme Corp', 'acme')
	 * await ctx.iam.orgs.addMember(org.id, userId, 'admin')
	 */
	orgs: OrgManager

	/**
	 * UsersManager for creating/managing user accounts.
	 *
	 * @example
	 * const user = await ctx.iam.users.create({ email: 'user@example.com', password: 'secret' })
	 * await ctx.iam.users.updatePassword('user-123', 'newPassword')
	 */
	users: UsersManager

	/**
	 * SubscriptionManager for managing subscriptions and plans.
	 *
	 * @example
	 * const sub = await ctx.iam.subscriptions.create(orgId, 'pro')
	 * const features = await ctx.iam.subscriptions.getPlanFeatures('pro')
	 */
	subscriptions: SubscriptionManager

	/**
	 * Invalidate permission cache for a specific role or all roles.
	 *
	 * @example
	 * ctx.iam.invalidateCache('editor') // After changing editor permissions
	 */
	invalidateCache: (roleKey?: string) => void
}

export interface CreateIAMManagerOptions {
	db: DatabaseClient
	logger: Logger
}

/**
 * In-memory cache for role permissions (TTL: 5 minutes)
 * Shared across requests for performance.
 */
export const permissionCache: Map<
	string,
	{ permissions: string[]; expiresAt: number }
> = new Map()

export const CACHE_TTL_MS: number = 5 * 60 * 1000 // 5 minutes

/**
 * Creates an IAM Manager for admin operations on roles, orgs, and subscriptions.
 */
export function createIAMManager(opts: CreateIAMManagerOptions): IAMManager {
	const roleManager = new RoleManager(opts.db)
	const orgManager = new OrgManager(opts.db)
	const usersManager = new UsersManager(opts.db)
	const subscriptionManager = new SubscriptionManager(opts.db)

	return {
		roles: roleManager,
		orgs: orgManager,
		users: usersManager,
		subscriptions: subscriptionManager,

		invalidateCache: (roleKeyToInvalidate?: string) => {
			if (roleKeyToInvalidate) {
				permissionCache.delete(roleKeyToInvalidate)
			} else {
				permissionCache.clear()
			}
		},
	}
}
