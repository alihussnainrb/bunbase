import { describe, expect, it } from 'bun:test'
import { RoleService } from '../src/saas/roles.ts'

describe('RoleService', () => {
	describe('constructor', () => {
		it('should initialize with default roles', () => {
			const service = new RoleService()

			const owner = service.getRole('owner')
			const member = service.getRole('member')

			expect(owner).toBeDefined()
			expect(owner?.key).toBe('owner')
			expect(owner?.name).toBe('Owner')
			expect(owner?.permissions).toContain('*')

			expect(member).toBeDefined()
			expect(member?.key).toBe('member')
			expect(member?.name).toBe('Member')
		})
	})

	describe('addRole()', () => {
		it('should add custom role', () => {
			const service = new RoleService()

			service.addRole({
				key: 'admin',
				name: 'Administrator',
				description: 'Can manage most things',
				permissions: ['users:manage', 'settings:read'],
			})

			const admin = service.getRole('admin')
			expect(admin).toBeDefined()
			expect(admin?.key).toBe('admin')
			expect(admin?.permissions).toContain('users:manage')
		})
	})

	describe('getRole()', () => {
		it('should return undefined for unknown role', () => {
			const service = new RoleService()

			const unknown = service.getRole('unknown')

			expect(unknown).toBeUndefined()
		})
	})

	describe('hasPermission()', () => {
		it('should return true for owner with any permission', () => {
			const service = new RoleService()

			expect(service.hasPermission('owner', 'anything')).toBe(true)
			expect(service.hasPermission('owner', '*')).toBe(true)
			expect(service.hasPermission('owner', 'users:create')).toBe(true)
		})

		it('should return true for member with matching permission', () => {
			const service = new RoleService()

			expect(service.hasPermission('member', 'org:read')).toBe(true)
		})

		it('should return false for member without permission', () => {
			const service = new RoleService()

			expect(service.hasPermission('member', 'users:delete')).toBe(false)
		})

		it('should return false for unknown role', () => {
			const service = new RoleService()

			expect(service.hasPermission('unknown', 'org:read')).toBe(false)
		})

		it('should work with custom roles', () => {
			const service = new RoleService()

			service.addRole({
				key: 'moderator',
				name: 'Moderator',
				description: 'Can moderate content',
				permissions: ['content:edit', 'content:delete'],
			})

			expect(service.hasPermission('moderator', 'content:edit')).toBe(true)
			expect(service.hasPermission('moderator', 'content:delete')).toBe(true)
			expect(service.hasPermission('moderator', 'users:create')).toBe(false)
		})
	})
})
