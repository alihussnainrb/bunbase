// IAM (Identity & Access Management) exports

export {
	buildAuthContext,
	hasPermission,
	resolvePermissions,
} from './auth-helpers.ts'
export type { IAMContext } from './context.ts'
export { createIAMContext } from './context.ts'
export type { Permission, Role, RolePermission } from './role-manager.ts'
export { RoleManager } from './role-manager.ts'
