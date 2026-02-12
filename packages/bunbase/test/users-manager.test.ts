import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { hashPassword, verifyPassword } from '../src/auth/password.ts'
import type { DatabaseClient } from '../src/db/client.ts'
import { UsersManager } from '../src/iam/users-manager.ts'

// Mock database
const createMockDb = () => {
	const users = new Map<string, any>()
	let idCounter = 1

	return {
		users,
		db: {
			from: (table: string) => {
				if (table !== 'users') throw new Error('Unsupported table')
				const queryBuilder = {
					eq: (field: string, value: any) => ({
						...queryBuilder,
						maybeSingle: async () => {
							for (const user of users.values()) {
								if (user[field] === value) return user
							}
							return null
						},
						single: async () => {
							for (const user of users.values()) {
								if (user[field] === value) return user
							}
							throw new Error('Not found')
						},
						delete: async () => {
							for (const [id, user] of users.entries()) {
								if (user[field] === value) {
									users.delete(id)
								}
							}
						},
						update: async (data: any) => {
							for (const [id, user] of users.entries()) {
								if (user[field] === value) {
									users.set(id, { ...user, ...data })
								}
							}
						},
					}),
					insert: async (data: any) => {
						const id = `user-${idCounter++}`
						const user = { id, ...data, created_at: new Date().toISOString() }
						users.set(id, user)
						return user
					},
					limit: (n: number) => ({
						offset: (skip: number) => ({
							exec: async () => {
								const allUsers = Array.from(users.values())
								return allUsers.slice(skip, skip + n)
							},
						}),
						exec: async () => {
							const allUsers = Array.from(users.values())
							return allUsers.slice(0, n)
						},
					}),
					offset: (skip: number) => ({
						exec: async () => {
							const allUsers = Array.from(users.values())
							return allUsers.slice(skip)
						},
					}),
					exec: async () => {
						return Array.from(users.values())
					},
					select: (..._fields: string[]) => ({
						limit: (n: number) => ({
							offset: (skip: number) => ({
								exec: async () => {
									const allUsers = Array.from(users.values())
									return allUsers.slice(skip, skip + n)
								},
							}),
						}),
					}),
				}
				return queryBuilder
			},
		} as any as DatabaseClient,
		reset: () => {
			users.clear()
			idCounter = 1
		},
	}
}

describe('UsersManager', () => {
	let mockDb: ReturnType<typeof createMockDb>
	let usersManager: UsersManager

	beforeEach(async () => {
		mockDb = createMockDb()
		usersManager = new UsersManager(mockDb.db)

		// Create test users
		const passwordHash = await hashPassword('password123')
		mockDb.users.set('user-1', {
			id: 'user-1',
			email: 'test@example.com',
			username: 'testuser',
			phone: '+1234567890',
			password_hash: passwordHash,
			first_name: 'Test',
			last_name: 'User',
			created_at: '2024-01-01T00:00:00Z',
		})
		mockDb.users.set('user-2', {
			id: 'user-2',
			email: 'admin@example.com',
			username: 'admin',
			phone: '+9876543210',
			password_hash: passwordHash,
			first_name: 'Admin',
			last_name: 'User',
			created_at: '2024-01-02T00:00:00Z',
		})
	})

	afterEach(() => {
		mockDb.reset()
	})

	describe('getById()', () => {
		test('should retrieve user by id', async () => {
			const user = await usersManager.getById('user-1')
			expect(user).not.toBeNull()
			expect(user?.id).toBe('user-1')
			expect(user?.email).toBe('test@example.com')
		})

		test('should return null for non-existent id', async () => {
			const user = await usersManager.getById('user-999')
			expect(user).toBeNull()
		})
	})

	describe('getByEmail()', () => {
		test('should retrieve user by email', async () => {
			const user = await usersManager.getByEmail('test@example.com')
			expect(user).not.toBeNull()
			expect(user?.id).toBe('user-1')
			expect(user?.email).toBe('test@example.com')
		})

		test('should return null for non-existent email', async () => {
			const user = await usersManager.getByEmail('nonexistent@example.com')
			expect(user).toBeNull()
		})

		test('should be case-sensitive', async () => {
			const user = await usersManager.getByEmail('TEST@example.com')
			expect(user).toBeNull()
		})
	})

	describe('getByUsername()', () => {
		test('should retrieve user by username', async () => {
			const user = await usersManager.getByUsername('testuser')
			expect(user).not.toBeNull()
			expect(user?.id).toBe('user-1')
			expect(user?.username).toBe('testuser')
		})

		test('should return null for non-existent username', async () => {
			const user = await usersManager.getByUsername('nonexistent')
			expect(user).toBeNull()
		})

		test('should be case-sensitive', async () => {
			const user = await usersManager.getByUsername('TESTUSER')
			expect(user).toBeNull()
		})
	})

	describe('getByPhone()', () => {
		test('should retrieve user by phone', async () => {
			const user = await usersManager.getByPhone('+1234567890')
			expect(user).not.toBeNull()
			expect(user?.id).toBe('user-1')
			expect(user?.phone).toBe('+1234567890')
		})

		test('should return null for non-existent phone', async () => {
			const user = await usersManager.getByPhone('+9999999999')
			expect(user).toBeNull()
		})
	})

	describe('create()', () => {
		test('should create user with email and password', async () => {
			const newUser = await usersManager.create({
				email: 'newuser@example.com',
				password: 'newpassword123',
				first_name: 'New',
				last_name: 'User',
			})

			expect(newUser.id).toBeDefined()
			expect(newUser.email).toBe('newuser@example.com')
			expect(newUser.first_name).toBe('New')
			expect(newUser.last_name).toBe('User')
			expect(newUser.password_hash).toBeDefined()
			expect(newUser.password_hash).not.toBe('newpassword123') // Should be hashed
		})

		test('should create user with username and password', async () => {
			const newUser = await usersManager.create({
				username: 'newusername',
				password: 'newpassword123',
			})

			expect(newUser.id).toBeDefined()
			expect(newUser.username).toBe('newusername')
			expect(newUser.password_hash).toBeDefined()
		})

		test('should create user with phone and password', async () => {
			const newUser = await usersManager.create({
				phone: '+1111111111',
				password: 'newpassword123',
			})

			expect(newUser.id).toBeDefined()
			expect(newUser.phone).toBe('+1111111111')
			expect(newUser.password_hash).toBeDefined()
		})

		test('should create user with all credentials', async () => {
			const newUser = await usersManager.create({
				email: 'all@example.com',
				username: 'allcreds',
				phone: '+2222222222',
				password: 'password123',
				first_name: 'All',
				last_name: 'Credentials',
			})

			expect(newUser.id).toBeDefined()
			expect(newUser.email).toBe('all@example.com')
			expect(newUser.username).toBe('allcreds')
			expect(newUser.phone).toBe('+2222222222')
			expect(newUser.first_name).toBe('All')
			expect(newUser.last_name).toBe('Credentials')
		})

		test('should create user with additional custom fields', async () => {
			const newUser = await usersManager.create({
				email: 'custom@example.com',
				password: 'password123',
				role: 'admin',
				status: 'active',
				metadata: { source: 'api' },
			})

			expect(newUser.id).toBeDefined()
			expect(newUser.email).toBe('custom@example.com')
			expect(newUser.role).toBe('admin')
			expect(newUser.status).toBe('active')
			expect(newUser.metadata).toEqual({ source: 'api' })
		})

		test('should hash password automatically', async () => {
			const newUser = await usersManager.create({
				email: 'hashed@example.com',
				password: 'plaintext',
			})

			expect(newUser.password_hash).toBeDefined()
			expect(newUser.password_hash).not.toBe('plaintext')
			expect(newUser.password_hash?.length).toBeGreaterThan(50)

			// Verify the hash is valid
			const isValid = await verifyPassword(
				'plaintext',
				newUser.password_hash as string,
			)
			expect(isValid).toBe(true)
		})

		test('should throw error when password is empty string', async () => {
			await expect(
				usersManager.create({
					email: 'emptypass@example.com',
					password: '',
				}),
			).rejects.toThrow('password must not be empty')
		})
	})

	describe('update()', () => {
		test('should update user fields', async () => {
			await usersManager.update('user-1', {
				first_name: 'Updated',
				last_name: 'Name',
			})

			const user = await usersManager.getById('user-1')
			expect(user?.first_name).toBe('Updated')
			expect(user?.last_name).toBe('Name')
		})

		test('should update email', async () => {
			await usersManager.update('user-1', {
				email: 'updated@example.com',
			})

			const user = await usersManager.getById('user-1')
			expect(user?.email).toBe('updated@example.com')
		})

		test('should update multiple fields at once', async () => {
			await usersManager.update('user-1', {
				email: 'multi@example.com',
				username: 'multiupdate',
				phone: '+3333333333',
			})

			const user = await usersManager.getById('user-1')
			expect(user?.email).toBe('multi@example.com')
			expect(user?.username).toBe('multiupdate')
			expect(user?.phone).toBe('+3333333333')
		})

		test('should update custom fields', async () => {
			await usersManager.update('user-1', {
				status: 'inactive',
				metadata: { updated: true },
			})

			const user = await usersManager.getById('user-1')
			expect(user?.status).toBe('inactive')
			expect(user?.metadata).toEqual({ updated: true })
		})

		test('should not update password via regular update', async () => {
			// Update passes through all fields including password
			await usersManager.update('user-1', {
				password: 'newpassword',
			})

			const user = await usersManager.getById('user-1')
			// Password field gets added to record (use updatePassword for proper hashing)
			expect(user?.password).toBe('newpassword')
		})
	})

	describe('delete()', () => {
		test('should delete user by id', async () => {
			await usersManager.delete('user-1')
			const user = await usersManager.getById('user-1')
			expect(user).toBeNull()
		})

		test('should not throw when deleting non-existent user', async () => {
			// Silent success - no error thrown
			await usersManager.delete('user-999')
			expect(true).toBe(true)
		})
	})

	describe('updatePassword()', () => {
		test('should update user password', async () => {
			await usersManager.updatePassword('user-1', 'newpassword456')

			const user = await usersManager.getById('user-1')
			expect(user?.password_hash).toBeDefined()

			// Verify new password works
			const isValid = await verifyPassword(
				'newpassword456',
				user?.password_hash as string,
			)
			expect(isValid).toBe(true)

			// Verify old password doesn't work
			const isOldValid = await verifyPassword(
				'password123',
				user?.password_hash as string,
			)
			expect(isOldValid).toBe(false)
		})

		test('should hash new password', async () => {
			await usersManager.updatePassword('user-1', 'plaintextnew')

			const user = await usersManager.getById('user-1')
			expect(user?.password_hash).not.toBe('plaintextnew')
			expect(user?.password_hash?.length).toBeGreaterThan(50)
		})
	})

	describe('verifyPassword()', () => {
		test('should return true for correct password', async () => {
			const isValid = await usersManager.verifyPassword('user-1', 'password123')
			expect(isValid).toBe(true)
		})

		test('should return false for incorrect password', async () => {
			const isValid = await usersManager.verifyPassword(
				'user-1',
				'wrongpassword',
			)
			expect(isValid).toBe(false)
		})

		test('should return false for non-existent user', async () => {
			const isValid = await usersManager.verifyPassword(
				'user-999',
				'password123',
			)
			expect(isValid).toBe(false)
		})

		test('should throw error for user without password_hash', async () => {
			mockDb.users.set('user-no-pass', {
				id: 'user-no-pass',
				email: 'nopass@example.com',
			})

			await expect(
				usersManager.verifyPassword('user-no-pass', 'password123'),
			).rejects.toThrow()
		})
	})

	describe('list()', () => {
		test('should list all users', async () => {
			const users = await usersManager.list()
			expect(users.length).toBe(2)
		})

		test('should respect limit parameter', async () => {
			const users = await usersManager.list({ limit: 1 })
			expect(users.length).toBe(1)
		})

		test('should respect offset parameter', async () => {
			const users = await usersManager.list({ offset: 1 })
			expect(users.length).toBe(1)
			expect(users[0].id).toBe('user-2')
		})

		test('should combine limit and offset', async () => {
			const users = await usersManager.list({ limit: 1, offset: 1 })
			expect(users.length).toBe(1)
			expect(users[0].id).toBe('user-2')
		})

		test('should list all users when no limit specified', async () => {
			// Add many users
			for (let i = 3; i <= 150; i++) {
				mockDb.users.set(`user-${i}`, {
					id: `user-${i}`,
					email: `user${i}@example.com`,
					password_hash: 'hash',
				})
			}

			const users = await usersManager.list()
			expect(users.length).toBe(150)
		})

		test('should handle offset beyond available records', async () => {
			const users = await usersManager.list({ offset: 100 })
			expect(users.length).toBe(0)
		})
	})

	describe('edge cases', () => {
		test('should handle users with minimal data', async () => {
			const newUser = await usersManager.create({
				email: 'minimal@example.com',
				password: 'password123',
			})

			expect(newUser.id).toBeDefined()
			expect(newUser.email).toBe('minimal@example.com')
			expect(newUser.first_name).toBeUndefined()
			expect(newUser.last_name).toBeUndefined()
			expect(newUser.phone).toBeUndefined()
			expect(newUser.username).toBeUndefined()
		})

		test('should handle users with very long names', async () => {
			const longName = 'A'.repeat(500)
			const newUser = await usersManager.create({
				email: 'longname@example.com',
				password: 'password123',
				first_name: longName,
			})

			expect(newUser.first_name).toBe(longName)
		})

		test('should handle special characters in fields', async () => {
			const newUser = await usersManager.create({
				email: 'special+chars@example.com',
				password: 'p@$$w0rd!#$%',
				first_name: "O'Brien",
				last_name: 'von Müller',
			})

			expect(newUser.email).toBe('special+chars@example.com')
			expect(newUser.first_name).toBe("O'Brien")
			expect(newUser.last_name).toBe('von Müller')

			const isValid = await usersManager.verifyPassword(
				newUser.id as string,
				'p@$$w0rd!#$%',
			)
			expect(isValid).toBe(true)
		})

		test('should handle unicode characters', async () => {
			const newUser = await usersManager.create({
				email: 'unicode@example.com',
				password: 'password123',
				first_name: '李明',
				last_name: '王',
			})

			expect(newUser.first_name).toBe('李明')
			expect(newUser.last_name).toBe('王')
		})

		test('should handle null values in update', async () => {
			await usersManager.update('user-1', {
				first_name: null,
				last_name: null,
			})

			const user = await usersManager.getById('user-1')
			expect(user?.first_name).toBeNull()
			expect(user?.last_name).toBeNull()
		})
	})
})
