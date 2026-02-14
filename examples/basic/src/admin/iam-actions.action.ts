/**
 * Example admin actions for managing roles and permissions dynamically.
 * These actions demonstrate the platform RBAC system that allows admins to:
 * - Create/update/delete roles
 * - Create/delete permissions
 * - Assign/revoke permissions to roles
 *
 * Guards can be simple (in-memory checks) while permission logic uses the database.
 */

import { action, Forbidden, guards, t } from 'bunbase'

// ── Role Management Actions ────────────────────────────────

export const createRole = action(
	{
		name: 'admin.roles.create',
		description: 'Create a new role',
		input: t.Object({
			key: t.String({ minLength: 1, maxLength: 100 }),
			name: t.String({ minLength: 1, maxLength: 255 }),
			description: t.Optional(t.String()),
			weight: t.Optional(t.Number({ minimum: 0, maximum: 1000 })),
		}),
		output: t.Object({
			id: t.String(),
			key: t.String(),
			name: t.String(),
			weight: t.Number(),
		}),
		triggers: [
			{
				type: 'api',
				method: 'POST',
				path: '/admin/roles',
			},
		],
		guards: [
			guards.authenticated(),
			guards.hasRole('org:admin'), // Simple in-memory check
		],
	},
	async (input, ctx) => {
		// Use ctx.platform for DB-backed permission management
		const role = await ctx.platform.rbac.roles.create({
			key: input.key,
			name: input.name,
			description: input.description,
			weight: input.weight || 0,
		})

		return {
			id: role.id,
			key: role.key,
			name: role.name,
			weight: role.weight,
		}
	},
)

export const listRoles = action(
	{
		name: 'admin.roles.list',
		description: 'List all roles',
		input: t.Object({}),
		output: t.Object({
			roles: t.Array(
				t.Object({
					id: t.String(),
					key: t.String(),
					name: t.String(),
					description: t.Union([t.String(), t.Null()]),
					weight: t.Number(),
				}),
			),
		}),
		triggers: [
			{
				type: 'api',
				method: 'GET',
				path: '/admin/roles',
			},
		],
		guards: [guards.authenticated()],
	},
	async (_input, ctx) => {
		const roles = await ctx.platform.rbac.roles.list()

		return {
			roles: roles.map((r) => ({
				id: r.id,
				key: r.key,
				name: r.name,
				description: r.description,
				weight: r.weight,
			})),
		}
	},
)

export const deleteRole = action(
	{
		name: 'admin.roles.delete',
		description: 'Delete a role',
		input: t.Object({
			key: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
		}),
		triggers: [
			{
				type: 'api',
				method: 'DELETE',
				path: '/admin/roles/:key',
			},
		],
		guards: [guards.authenticated(), guards.hasRole('org:admin')],
	},
	async (input, ctx) => {
		await ctx.platform.rbac.roles.delete(input.key)

		return { success: true }
	},
)

// ── Permission Management Actions ──────────────────────────

export const createPermission = action(
	{
		name: 'admin.permissions.create',
		description: 'Create a new permission',
		input: t.Object({
			key: t.String({ minLength: 1, maxLength: 100 }),
			name: t.String({ minLength: 1, maxLength: 255 }),
			description: t.Optional(t.String()),
		}),
		output: t.Object({
			id: t.String(),
			key: t.String(),
			name: t.String(),
		}),
		triggers: [
			{
				type: 'api',
				method: 'POST',
				path: '/admin/permissions',
			},
		],
		guards: [guards.authenticated(), guards.hasRole('org:admin')],
	},
	async (input, ctx) => {
		const permission = await ctx.platform.rbac.permissions.create({
			key: input.key,
			name: input.name,
			description: input.description,
		})

		return {
			id: permission.id,
			key: permission.key,
			name: permission.name,
		}
	},
)

export const listPermissions = action(
	{
		name: 'admin.permissions.list',
		description: 'List all permissions',
		input: t.Object({}),
		output: t.Object({
			permissions: t.Array(
				t.Object({
					id: t.String(),
					key: t.String(),
					name: t.String(),
					description: t.Union([t.String(), t.Null()]),
				}),
			),
		}),
		triggers: [
			{
				type: 'api',
				method: 'GET',
				path: '/admin/permissions',
			},
		],
		guards: [guards.authenticated()],
	},
	async (_input, ctx) => {
		const permissions = await ctx.platform.rbac.permissions.list()

		return {
			permissions: permissions.map((p) => ({
				id: p.id,
				key: p.key,
				name: p.name,
				description: p.description,
			})),
		}
	},
)

// ── Role-Permission Assignment Actions ─────────────────────

export const assignPermission = action(
	{
		name: 'admin.roles.assign-permission',
		description: 'Assign a permission to a role',
		input: t.Object({
			roleKey: t.String(),
			permissionKey: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
		}),
		triggers: [
			{
				type: 'api',
				method: 'POST',
				path: '/admin/roles/:roleKey/permissions',
			},
		],
		guards: [guards.authenticated(), guards.hasRole('org:admin')],
	},
	async (input, ctx) => {
		await ctx.platform.rbac.assignments.assign(
			input.roleKey,
			input.permissionKey,
		)

		return { success: true }
	},
)

export const revokePermission = action(
	{
		name: 'admin.roles.revoke-permission',
		description: 'Revoke a permission from a role',
		input: t.Object({
			roleKey: t.String(),
			permissionKey: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
		}),
		triggers: [
			{
				type: 'api',
				method: 'DELETE',
				path: '/admin/roles/:roleKey/permissions/:permissionKey',
			},
		],
		guards: [guards.authenticated(), guards.hasRole('org:admin')],
	},
	async (input, ctx) => {
		await ctx.platform.rbac.assignments.revoke(
			input.roleKey,
			input.permissionKey,
		)

		return { success: true }
	},
)

export const getRolePermissions = action(
	{
		name: 'admin.roles.list-permissions',
		description: 'Get all permissions for a role',
		input: t.Object({
			roleKey: t.String(),
		}),
		output: t.Object({
			roleKey: t.String(),
			permissions: t.Array(t.String()),
		}),
		triggers: [
			{
				type: 'api',
				method: 'GET',
				path: '/admin/roles/:roleKey/permissions',
			},
		],
		guards: [guards.authenticated()],
	},
	async (input, ctx) => {
		const permissions =
			await ctx.platform.rbac.assignments.listForRole(input.roleKey)

		return {
			roleKey: input.roleKey,
			permissions,
		}
	},
)

// ── Dynamic Permission Check Example ───────────────────────

export const checkPermission = action(
	{
		name: 'admin.check-permission',
		description: 'Check if current user has a specific permission',
		input: t.Object({
			permission: t.String(),
		}),
		output: t.Object({
			allowed: t.Boolean(),
			reason: t.Optional(t.String()),
		}),
		triggers: [
			{
				type: 'api',
				method: 'POST',
				path: '/admin/check-permission',
			},
		],
		guards: [guards.authenticated()],
	},
	async (input, ctx) => {
		// Permission checks are on ctx.auth (not ctx.iam)
		const result = await ctx.auth.can(input.permission)

		return result
	},
)

// ── Example Action Using Dynamic Permission Checks ─────────

export const deleteOrganization = action(
	{
		name: 'admin.organizations.delete',
		description: 'Delete an organization (requires org:delete permission)',
		input: t.Object({
			orgId: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
		}),
		triggers: [
			{
				type: 'api',
				method: 'DELETE',
				path: '/admin/organizations/:orgId',
			},
		],
		guards: [guards.authenticated()],
	},
	async (input, ctx) => {
		// Instead of using guards.hasPermission(), check dynamically
		const { allowed, reason } = await ctx.auth.can('org:delete')

		if (!allowed) {
			throw new Forbidden(reason || 'Permission denied')
		}

		// Perform deletion
		await ctx.db.from('organizations').eq('id', input.orgId).delete().exec()

		ctx.logger.info('Organization deleted', { orgId: input.orgId })

		return { success: true }
	},
)
