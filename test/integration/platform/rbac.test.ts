/**
 * Integration tests for RBAC module
 * Tests roles, permissions, and assignments
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { sql as createSql } from 'bun'
import type { SQL } from 'bun'
import { Logger } from '../../../packages/bunbase/src/logger/index.ts'
import { RoleManager } from '../../../packages/bunbase/src/platform/rbac/role-manager.ts'
import { PermissionManager } from '../../../packages/bunbase/src/platform/rbac/permission-manager.ts'
import { AssignmentManager } from '../../../packages/bunbase/src/platform/rbac/assignment-manager.ts'
import type { UserId, RoleId, OrgId } from '../../../packages/bunbase/src/platform/core/types.ts'
import {
	RoleNotFoundError,
	PermissionNotFoundError,
	MissingPermissionError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'

let sql: SQL
let logger: Logger
let roleManager: RoleManager
let permissionManager: PermissionManager
let assignmentManager: AssignmentManager

// Test IDs
const userId1 = 'usr_rbac_test1' as UserId
const userId2 = 'usr_rbac_test2' as UserId
const orgId1 = 'org_rbac_test1' as OrgId

beforeAll(async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error('DATABASE_URL environment variable is required for integration tests')
	}

	sql = createSql(dbUrl)
	logger = new Logger()

	roleManager = new RoleManager(sql, logger)
	permissionManager = new PermissionManager(sql, logger)
	assignmentManager = new AssignmentManager(sql, logger)

	// Create test users
	await sql`
		INSERT INTO users (id, email, password_hash, created_at)
		VALUES
			(${userId1}, 'rbac1@test.com', 'hash1', NOW()),
			(${userId2}, 'rbac2@test.com', 'hash2', NOW())
		ON CONFLICT (id) DO NOTHING
	`
})

describe('RoleManager', () => {
	test('create role', async () => {
		const role = await roleManager.create({
			key: 'test:admin',
			name: 'Test Administrator',
			description: 'Full admin access for testing',
			weight: 100,
		})

		expect(role.id).toBeDefined()
		expect(role.key).toBe('test:admin')
		expect(role.name).toBe('Test Administrator')
		expect(role.description).toBe('Full admin access for testing')
		expect(role.weight).toBe(100)
		expect(role.createdAt).toBeDefined()
	})

	test('create role with default weight', async () => {
		const role = await roleManager.create({
			key: 'test:member',
			name: 'Test Member',
		})

		expect(role.weight).toBe(0)
	})

	test('get role by ID', async () => {
		const created = await roleManager.create({
			key: 'test:fetch',
			name: 'Fetch Test Role',
			weight: 50,
		})

		const fetched = await roleManager.get(created.id)

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
		expect(fetched?.key).toBe('test:fetch')
	})

	test('get role by key', async () => {
		const created = await roleManager.create({
			key: 'test:bykey',
			name: 'By Key Test Role',
			weight: 40,
		})

		const fetched = await roleManager.getByKey('test:bykey')

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
	})

	test('update role', async () => {
		const role = await roleManager.create({
			key: 'test:update',
			name: 'Old Name',
			weight: 10,
		})

		const updated = await roleManager.update(role.id, {
			name: 'New Name',
			weight: 20,
		})

		expect(updated.name).toBe('New Name')
		expect(updated.weight).toBe(20)
		expect(updated.key).toBe('test:update') // Key unchanged
	})

	test('list roles', async () => {
		const roles = await roleManager.list()

		expect(roles.length).toBeGreaterThan(0)
	})

	test('list roles ordered by weight descending', async () => {
		await roleManager.create({ key: 'test:high', name: 'High', weight: 100 })
		await roleManager.create({ key: 'test:low', name: 'Low', weight: 10 })

		const roles = await roleManager.list({ orderBy: 'weight', orderDirection: 'desc' })

		const highIndex = roles.findIndex((r) => r.key === 'test:high')
		const lowIndex = roles.findIndex((r) => r.key === 'test:low')

		expect(highIndex).toBeLessThan(lowIndex)
	})

	test('delete role', async () => {
		const role = await roleManager.create({
			key: 'test:delete',
			name: 'Delete Test',
		})

		await roleManager.delete(role.id)

		const fetched = await roleManager.get(role.id)
		expect(fetched).toBeNull()
	})

	test('compare role weights', async () => {
		await roleManager.create({ key: 'test:higher', name: 'Higher', weight: 100 })
		await roleManager.create({ key: 'test:lower', name: 'Lower', weight: 50 })

		const higherThanLower = await roleManager.compareRoles('test:higher', 'test:lower')
		const lowerThanHigher = await roleManager.compareRoles('test:lower', 'test:higher')

		expect(higherThanLower).toBe(true)
		expect(lowerThanHigher).toBe(false)
	})
})

describe('PermissionManager', () => {
	test('create permission', async () => {
		const permission = await permissionManager.create({
			key: 'test:read',
			name: 'Read Test Resources',
			description: 'Allows reading test resources',
		})

		expect(permission.id).toBeDefined()
		expect(permission.key).toBe('test:read')
		expect(permission.name).toBe('Read Test Resources')
		expect(permission.description).toBe('Allows reading test resources')
		expect(permission.createdAt).toBeDefined()
	})

	test('get permission by ID', async () => {
		const created = await permissionManager.create({
			key: 'test:write',
			name: 'Write Test Resources',
		})

		const fetched = await permissionManager.get(created.id)

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
		expect(fetched?.key).toBe('test:write')
	})

	test('get permission by key', async () => {
		const created = await permissionManager.create({
			key: 'test:delete',
			name: 'Delete Test Resources',
		})

		const fetched = await permissionManager.getByKey('test:delete')

		expect(fetched).not.toBeNull()
		expect(fetched?.id).toBe(created.id)
	})

	test('update permission', async () => {
		const permission = await permissionManager.create({
			key: 'test:update_perm',
			name: 'Old Permission Name',
		})

		const updated = await permissionManager.update(permission.id, {
			name: 'New Permission Name',
			description: 'Updated description',
		})

		expect(updated.name).toBe('New Permission Name')
		expect(updated.description).toBe('Updated description')
	})

	test('list permissions', async () => {
		const permissions = await permissionManager.list()

		expect(permissions.length).toBeGreaterThan(0)
	})

	test('delete permission', async () => {
		const permission = await permissionManager.create({
			key: 'test:delete_perm',
			name: 'Delete Test Permission',
		})

		await permissionManager.delete(permission.id)

		const fetched = await permissionManager.get(permission.id)
		expect(fetched).toBeNull()
	})

	test('assign permission to role', async () => {
		const role = await roleManager.create({
			key: 'test:role_with_perms',
			name: 'Role With Permissions',
		})

		const permission = await permissionManager.create({
			key: 'test:perm_for_role',
			name: 'Permission For Role',
		})

		await permissionManager.assignToRole(permission.id, role.id)

		const permissions = await permissionManager.getPermissionsForRole(role.id)

		expect(permissions.length).toBeGreaterThan(0)
		expect(permissions.some((p) => p.id === permission.id)).toBe(true)
	})

	test('remove permission from role', async () => {
		const role = await roleManager.create({
			key: 'test:role_remove_perm',
			name: 'Role Remove Permission',
		})

		const permission = await permissionManager.create({
			key: 'test:perm_to_remove',
			name: 'Permission To Remove',
		})

		await permissionManager.assignToRole(permission.id, role.id)
		await permissionManager.removeFromRole(permission.id, role.id)

		const permissions = await permissionManager.getPermissionsForRole(role.id)

		expect(permissions.some((p) => p.id === permission.id)).toBe(false)
	})

	test('get roles with permission', async () => {
		const role1 = await roleManager.create({
			key: 'test:role_a',
			name: 'Role A',
			weight: 100,
		})

		const role2 = await roleManager.create({
			key: 'test:role_b',
			name: 'Role B',
			weight: 50,
		})

		const permission = await permissionManager.create({
			key: 'test:shared_perm',
			name: 'Shared Permission',
		})

		await permissionManager.assignToRole(permission.id, role1.id)
		await permissionManager.assignToRole(permission.id, role2.id)

		const roles = await permissionManager.getRolesWithPermission(permission.id)

		expect(roles.length).toBeGreaterThanOrEqual(2)
		expect(roles.some((r) => r.id === role1.id)).toBe(true)
		expect(roles.some((r) => r.id === role2.id)).toBe(true)
	})
})

describe('AssignmentManager', () => {
	let testRole: { id: RoleId; key: string }
	let testPermission: { id: string; key: string }

	beforeAll(async () => {
		testRole = await roleManager.create({
			key: 'test:assignment_role',
			name: 'Assignment Test Role',
			weight: 75,
		})

		testPermission = await permissionManager.create({
			key: 'test:assignment_perm',
			name: 'Assignment Test Permission',
		})

		await permissionManager.assignToRole(testPermission.id, testRole.id)
	})

	test('assign role to user', async () => {
		await assignmentManager.assignRole({
			principalType: 'user',
			principalId: userId1,
			roleId: testRole.id,
		})

		const roles = await assignmentManager.getRoles({
			principalType: 'user',
			principalId: userId1,
		})

		expect(roles.length).toBeGreaterThan(0)
		expect(roles.some((r) => r.roleId === testRole.id)).toBe(true)
	})

	test('assign role scoped to organization', async () => {
		const orgRole = await roleManager.create({
			key: 'test:org_role',
			name: 'Org Scoped Role',
		})

		await assignmentManager.assignRole({
			principalType: 'user',
			principalId: userId1,
			roleId: orgRole.id,
			orgId: orgId1,
		})

		const roles = await assignmentManager.getRoles({
			principalType: 'user',
			principalId: userId1,
			orgId: orgId1,
		})

		expect(roles.some((r) => r.roleId === orgRole.id && r.orgId === orgId1)).toBe(true)
	})

	test('resolve permissions for user', async () => {
		const permissions = await assignmentManager.resolvePermissions({
			principalType: 'user',
			principalId: userId1,
		})

		expect(permissions.length).toBeGreaterThan(0)
		expect(permissions).toContain(testPermission.key)
	})

	test('check if user has permission', async () => {
		const hasPermission = await assignmentManager.hasPermission(
			{
				principalType: 'user',
				principalId: userId1,
			},
			testPermission.key,
		)

		expect(hasPermission).toBe(true)
	})

	test('check if user lacks permission', async () => {
		const hasPermission = await assignmentManager.hasPermission(
			{
				principalType: 'user',
				principalId: userId2, // User without any roles
			},
			testPermission.key,
		)

		expect(hasPermission).toBe(false)
	})

	test('check if user has any permission', async () => {
		const hasAny = await assignmentManager.hasAnyPermission(
			{
				principalType: 'user',
				principalId: userId1,
			},
			['nonexistent:perm', testPermission.key],
		)

		expect(hasAny).toBe(true)
	})

	test('check if user has all permissions', async () => {
		const perm2 = await permissionManager.create({
			key: 'test:perm2',
			name: 'Second Permission',
		})

		await permissionManager.assignToRole(perm2.id, testRole.id)

		const hasAll = await assignmentManager.hasAllPermissions(
			{
				principalType: 'user',
				principalId: userId1,
			},
			[testPermission.key, perm2.key],
		)

		expect(hasAll).toBe(true)
	})

	test('require permission - success', async () => {
		await expect(
			assignmentManager.requirePermission(
				{
					principalType: 'user',
					principalId: userId1,
				},
				testPermission.key,
			),
		).resolves.toBeUndefined()
	})

	test('require permission - failure', async () => {
		await expect(
			assignmentManager.requirePermission(
				{
					principalType: 'user',
					principalId: userId2,
				},
				testPermission.key,
			),
		).rejects.toThrow(MissingPermissionError)
	})

	test('get highest role weight', async () => {
		const highRole = await roleManager.create({
			key: 'test:high_weight',
			name: 'High Weight Role',
			weight: 200,
		})

		await assignmentManager.assignRole({
			principalType: 'user',
			principalId: userId1,
			roleId: highRole.id,
		})

		const weight = await assignmentManager.getHighestRoleWeight({
			principalType: 'user',
			principalId: userId1,
		})

		expect(weight).toBeGreaterThanOrEqual(200)
	})

	test('remove role from user', async () => {
		const roleToRemove = await roleManager.create({
			key: 'test:removable',
			name: 'Removable Role',
		})

		await assignmentManager.assignRole({
			principalType: 'user',
			principalId: userId1,
			roleId: roleToRemove.id,
		})

		await assignmentManager.removeRole({
			principalType: 'user',
			principalId: userId1,
			roleId: roleToRemove.id,
		})

		const roles = await assignmentManager.getRoles({
			principalType: 'user',
			principalId: userId1,
		})

		expect(roles.some((r) => r.roleId === roleToRemove.id)).toBe(false)
	})

	test('list principals with role', async () => {
		await assignmentManager.assignRole({
			principalType: 'user',
			principalId: userId2,
			roleId: testRole.id,
		})

		const principals = await assignmentManager.listPrincipalsWithRole(testRole.id)

		expect(principals.length).toBeGreaterThan(0)
		expect(principals.some((p) => p.principalId === userId1)).toBe(true)
		expect(principals.some((p) => p.principalId === userId2)).toBe(true)
	})
})
