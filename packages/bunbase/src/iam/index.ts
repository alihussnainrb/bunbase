// IAM (Identity & Access Management) exports

export type { AuthContext } from './auth-context.ts'
export { createAuthContext } from './auth-context.ts'
export {
	buildAuthContext,
	hasPermission,
	resolvePermissions,
} from './auth-helpers.ts'
export type { IAMManager } from './context.ts'
export { createIAMManager } from './context.ts'
export { OrgManager } from './org-manager.ts'
export type { Permission, Role, RolePermission } from './role-manager.ts'
export { RoleManager } from './role-manager.ts'
export { SubscriptionManager } from './subscription-manager.ts'
export type {
	Organization,
	OrgMembership,
	SessionAction,
	Subscription,
} from './types.ts'
export { UsersManager } from './users-manager.ts'
