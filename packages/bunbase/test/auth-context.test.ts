import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { hashPassword } from '../src/auth/password.ts'
import type { SessionManager } from '../src/auth/session.ts'
import type { DatabaseClient } from '../src/db/client.ts'
import { createAuthContext } from '../src/iam/auth-context.ts'

// Mock database
const createMockDb = () => {
	const users = new Map<string, any>()
	let idCounter = 1

	return {
		users,
		db: {
			from: (table: string) => {
				if (table !== 'users') throw new Error('Unsupported table')
				return {
					eq: (field: string, value: any) => ({
						maybeSingle: async () => {
							for (const user of users.values()) {
								if (user[field] === value) return user
							}
							return null
						},
					}),
					insert: async (data: any) => {
						const id = `user-${idCounter++}`
						const user = { id, ...data }
						users.set(id, user)
						return { id }
					},
				}
			},
		} as any as DatabaseClient,
		reset: () => {
			users.clear()
			idCounter = 1
		},
	}
}

// Mock session manager
const createMockSessionManager = (): SessionManager => {
	return {
		createSession: (_payload: any) => 'mock-session-token',
		verifySession: (_token: string) => ({ userId: 'user-1', role: 'user' }),
		destroySession: () => {},
	} as any
}

describe('AuthContext', () => {
	let mockDb: ReturnType<typeof createMockDb>
	let mockSessionManager: SessionManager

	beforeEach(async () => {
		mockDb = createMockDb()
		mockSessionManager = createMockSessionManager()

		// Create test users with different credentials
		const passwordHash = await hashPassword('password123')
		mockDb.users.set('user-1', {
			id: 'user-1',
			email: 'test@example.com',
			username: 'testuser',
			phone: '+1234567890',
			password_hash: passwordHash,
			role: 'user',
			first_name: 'Test',
			last_name: 'User',
		})
		mockDb.users.set('user-2', {
			id: 'user-2',
			email: 'admin@example.com',
			username: 'admin',
			phone: '+9876543210',
			password_hash: passwordHash,
			role: 'admin',
		})
	})

	afterEach(() => {
		mockDb.reset()
	})

	describe('loginWithEmail()', () => {
		test('should successfully login with valid email and password', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			const user = await authContext.loginWithEmail({
				email: 'test@example.com',
				password: 'password123',
			})

			expect(user.id).toBe('user-1')
			expect(user.email).toBe('test@example.com')
			expect(authContext._sessionActions).toHaveLength(1)
			expect(authContext._sessionActions?.[0]).toEqual({
				type: 'create',
				token: 'mock-session-token',
			})
		})

		test('should throw error for non-existent email', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithEmail({
					email: 'nonexistent@example.com',
					password: 'password123',
				}),
			).rejects.toThrow('Invalid credentials')

			expect(authContext._sessionActions).toHaveLength(0)
		})

		test('should throw error for invalid password', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithEmail({
					email: 'test@example.com',
					password: 'wrongpassword',
				}),
			).rejects.toThrow('Invalid credentials')

			expect(authContext._sessionActions).toHaveLength(0)
		})

		test('should throw error when database not configured', async () => {
			const authContext = createAuthContext({
				db: null,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithEmail({
					email: 'test@example.com',
					password: 'password123',
				}),
			).rejects.toThrow('Database not configured')
		})
	})

	describe('loginWithUsername()', () => {
		test('should successfully login with valid username and password', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			const user = await authContext.loginWithUsername({
				username: 'testuser',
				password: 'password123',
			})

			expect(user.id).toBe('user-1')
			expect(user.username).toBe('testuser')
			expect(authContext._sessionActions).toHaveLength(1)
			expect(authContext._sessionActions?.[0]).toEqual({
				type: 'create',
				token: 'mock-session-token',
			})
		})

		test('should throw error for non-existent username', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithUsername({
					username: 'nonexistent',
					password: 'password123',
				}),
			).rejects.toThrow('Invalid credentials')

			expect(authContext._sessionActions).toHaveLength(0)
		})

		test('should throw error for invalid password', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithUsername({
					username: 'testuser',
					password: 'wrongpassword',
				}),
			).rejects.toThrow('Invalid credentials')

			expect(authContext._sessionActions).toHaveLength(0)
		})

		test('should throw error when database not configured', async () => {
			const authContext = createAuthContext({
				db: null,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithUsername({
					username: 'testuser',
					password: 'password123',
				}),
			).rejects.toThrow('Database not configured')
		})
	})

	describe('loginWithPhone()', () => {
		test('should successfully login with valid phone and password', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			const user = await authContext.loginWithPhone({
				phone: '+1234567890',
				password: 'password123',
			})

			expect(user.id).toBe('user-1')
			expect(user.phone).toBe('+1234567890')
			expect(authContext._sessionActions).toHaveLength(1)
			expect(authContext._sessionActions?.[0]).toEqual({
				type: 'create',
				token: 'mock-session-token',
			})
		})

		test('should throw error for non-existent phone', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithPhone({
					phone: '+9999999999',
					password: 'password123',
				}),
			).rejects.toThrow('Invalid credentials')

			expect(authContext._sessionActions).toHaveLength(0)
		})

		test('should throw error for invalid password', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithPhone({
					phone: '+1234567890',
					password: 'wrongpassword',
				}),
			).rejects.toThrow('Invalid credentials')

			expect(authContext._sessionActions).toHaveLength(0)
		})

		test('should throw error when database not configured', async () => {
			const authContext = createAuthContext({
				db: null,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithPhone({
					phone: '+1234567890',
					password: 'password123',
				}),
			).rejects.toThrow('Database not configured')
		})
	})

	describe('logout()', () => {
		test('should successfully logout', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: 'user-1',
				role: 'user',
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			authContext.logout()

			expect(authContext._sessionActions).toHaveLength(1)
			expect(authContext._sessionActions?.[0]).toEqual({ type: 'destroy' })
		})
	})

	describe('edge cases', () => {
		test('should handle users with admin role', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			const user = await authContext.loginWithEmail({
				email: 'admin@example.com',
				password: 'password123',
			})

			expect(user.id).toBe('user-2')
			expect(user.role)
			expect(authContext._sessionActions?.[0].token)
		})

		test('should handle users with minimal profile data', async () => {
			const passwordHash = await hashPassword('password123')
			mockDb.users.set('user-3', {
				id: 'user-3',
				email: 'minimal@example.com',
				password_hash: passwordHash,
				role: 'user',
			})

			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			const user = await authContext.loginWithEmail({
				email: 'minimal@example.com',
				password: 'password123',
			})

			expect(user.id).toBe('user-3')
			expect(user.email).toBe('minimal@example.com')
			expect(user.first_name).toBeUndefined()
			expect(user.last_name).toBeUndefined()
		})

		test('should handle case-sensitive credentials', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			// Email mismatch (case difference)
			await expect(
				authContext.loginWithEmail({
					email: 'TEST@example.com',
					password: 'password123',
				}),
			).rejects.toThrow('Invalid credentials')

			// Username mismatch (case difference)
			await expect(
				authContext.loginWithUsername({
					username: 'TESTUSER',
					password: 'password123',
				}),
			).rejects.toThrow('Invalid credentials')
		})

		test('should handle empty password gracefully', async () => {
			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithEmail({
					email: 'test@example.com',
					password: '',
				}),
			).rejects.toThrow('Invalid credentials')
		})

		test('should handle users without password_hash field', async () => {
			mockDb.users.set('user-no-pass', {
				id: 'user-no-pass',
				email: 'nopass@example.com',
				role: 'user',
				// Missing password_hash
			})

			const authContext = createAuthContext({
				db: mockDb.db,
				userId: null,
				role: null,
				permissions: null,
				orgId: null,
				sessionManager: mockSessionManager,
			})

			await expect(
				authContext.loginWithEmail({
					email: 'nopass@example.com',
					password: 'password123',
				}),
			).rejects.toThrow()
		})
	})
})
