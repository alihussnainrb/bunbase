import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { PasswordAuthManager } from '../../../packages/bunbase/src/platform/auth/password.ts'
import { SessionDBManager } from '../../../packages/bunbase/src/platform/auth/session-db.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import {
	InvalidCredentialsError,
	EmailAlreadyExistsError,
	WeakPasswordError,
	InvalidEmailError,
	AccountSuspendedError,
	UserNotFoundError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'

describe('Platform: Password Auth', () => {
	const env = createTestEnv()
	let passwordAuthManager: PasswordAuthManager
	let sessionManager: SessionDBManager

	beforeAll(async () => {
		// Initialize managers
		const secret = 'test-secret-key-for-password-auth'
		sessionManager = new SessionDBManager(
			secret,
			env.db,
			env.logger,
			'test_session',
		)
		passwordAuthManager = new PasswordAuthManager(
			env.db,
			sessionManager,
			env.logger,
		)
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	// ====================================================================
	// SIGN UP
	// ====================================================================

	test('signs up a new user with password', async () => {
		const email = 'newuser@example.com'
		const password = 'SecurePass123!'
		const name = 'New User'

		const result = await passwordAuthManager.signUpPassword({
			email,
			password,
			name,
			ipAddress: '127.0.0.1',
			userAgent: 'Test Agent',
		})

		expect(result.user).toBeDefined()
		expect(result.user.email).toBe(email.toLowerCase())
		expect(result.user.name).toBe(name)
		expect(result.user.status).toBe('active')
		expect(result.user.emailVerifiedAt).toBeNull()

		expect(result.session).toBeDefined()
		expect(result.session.token).toBeDefined()
		expect(result.session.sessionId).toBeDefined()

		// Verify session works
		const payload = await sessionManager.verifySession(result.session.token)
		expect(payload.userId).toBe(result.user.id)
	})

	test('rejects signup with existing email', async () => {
		const email = 'existing@example.com'
		const password = 'SecurePass123!'

		// Create first user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'First User',
		})

		// Try to create second user with same email
		await expect(
			passwordAuthManager.signUpPassword({
				email,
				password,
				name: 'Second User',
			}),
		).rejects.toThrow(EmailAlreadyExistsError)
	})

	test('rejects signup with weak password', async () => {
		const email = 'weakpass@example.com'
		const weakPassword = 'short'

		await expect(
			passwordAuthManager.signUpPassword({
				email,
				password: weakPassword,
				name: 'Weak Pass User',
			}),
		).rejects.toThrow(WeakPasswordError)
	})

	test('rejects signup with invalid email', async () => {
		const invalidEmail = 'not-an-email'
		const password = 'SecurePass123!'

		await expect(
			passwordAuthManager.signUpPassword({
				email: invalidEmail,
				password,
				name: 'Invalid Email User',
			}),
		).rejects.toThrow(InvalidEmailError)
	})

	test('normalizes email to lowercase on signup', async () => {
		const email = 'MixedCase@Example.COM'
		const password = 'SecurePass123!'

		const result = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Mixed Case User',
		})

		expect(result.user.email).toBe('mixedcase@example.com')
	})

	// ====================================================================
	// SIGN IN
	// ====================================================================

	test('signs in with correct credentials', async () => {
		const email = 'signin@example.com'
		const password = 'SecurePass123!'

		// Create user
		const signUpResult = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Sign In User',
		})

		// Sign in
		const signInResult = await passwordAuthManager.signInPassword({
			email,
			password,
			ipAddress: '192.168.1.1',
			userAgent: 'Test Browser',
		})

		expect(signInResult.user.id).toBe(signUpResult.user.id)
		expect(signInResult.user.email).toBe(email.toLowerCase())
		expect(signInResult.session.token).toBeDefined()
		expect(signInResult.session.sessionId).toBeDefined()

		// Different session than signup
		expect(signInResult.session.sessionId).not.toBe(
			signUpResult.session.sessionId,
		)
	})

	test('rejects signin with wrong password', async () => {
		const email = 'wrongpass@example.com'
		const password = 'CorrectPass123!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Wrong Pass User',
		})

		// Try to sign in with wrong password
		await expect(
			passwordAuthManager.signInPassword({
				email,
				password: 'WrongPass123!',
			}),
		).rejects.toThrow(InvalidCredentialsError)
	})

	test('rejects signin with non-existent email', async () => {
		await expect(
			passwordAuthManager.signInPassword({
				email: 'nonexistent@example.com',
				password: 'SomePass123!',
			}),
		).rejects.toThrow(InvalidCredentialsError)
	})

	test('rejects signin for suspended account', async () => {
		const email = 'suspended@example.com'
		const password = 'SecurePass123!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Suspended User',
		})

		// Suspend account
		await env.db
			.from('users')
			.update({ status: 'suspended' })
			.eq('id', result.user.id)
			.exec()

		// Try to sign in
		await expect(
			passwordAuthManager.signInPassword({
				email,
				password,
			}),
		).rejects.toThrow(AccountSuspendedError)
	})

	test('normalizes email to lowercase on signin', async () => {
		const email = 'lowercase@example.com'
		const password = 'SecurePass123!'

		// Create user with lowercase
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Lowercase User',
		})

		// Sign in with mixed case
		const result = await passwordAuthManager.signInPassword({
			email: 'Lowercase@EXAMPLE.com',
			password,
		})

		expect(result.user.email).toBe(email)
	})

	// ====================================================================
	// SIGN OUT
	// ====================================================================

	test('signs out and revokes session', async () => {
		const email = 'signout@example.com'
		const password = 'SecurePass123!'

		// Create user and sign in
		const result = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Sign Out User',
		})

		// Verify session works
		await sessionManager.verifySession(result.session.token)

		// Sign out
		await passwordAuthManager.signOut(result.session.token)

		// Verify session is revoked
		await expect(
			sessionManager.verifySession(result.session.token),
		).rejects.toThrow()
	})

	// ====================================================================
	// CHANGE PASSWORD
	// ====================================================================

	test('changes password with correct old password', async () => {
		const email = 'changepass@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Change Pass User',
		})

		const userId = result.user.id

		// Change password
		await passwordAuthManager.changePassword(userId, oldPassword, newPassword)

		// Old password should not work
		await expect(
			passwordAuthManager.signInPassword({
				email,
				password: oldPassword,
			}),
		).rejects.toThrow(InvalidCredentialsError)

		// New password should work
		const signInResult = await passwordAuthManager.signInPassword({
			email,
			password: newPassword,
		})

		expect(signInResult.user.id).toBe(userId)
	})

	test('rejects password change with wrong old password', async () => {
		const email = 'wrongoldpass@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Wrong Old Pass User',
		})

		const userId = result.user.id

		// Try to change password with wrong old password
		await expect(
			passwordAuthManager.changePassword(userId, 'WrongOldPass!', newPassword),
		).rejects.toThrow(InvalidCredentialsError)

		// Old password should still work
		const signInResult = await passwordAuthManager.signInPassword({
			email,
			password: oldPassword,
		})

		expect(signInResult.user.id).toBe(userId)
	})

	test('rejects password change with weak new password', async () => {
		const email = 'weaknewpass@example.com'
		const oldPassword = 'OldPass123!'
		const weakNewPassword = 'weak'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Weak New Pass User',
		})

		// Try to change to weak password
		await expect(
			passwordAuthManager.changePassword(
				result.user.id,
				oldPassword,
				weakNewPassword,
			),
		).rejects.toThrow(WeakPasswordError)
	})

	test('revokes all sessions when changing password', async () => {
		const email = 'revokeonsessionchange@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Revoke Sessions User',
		})

		const userId = result.user.id
		const firstToken = result.session.token

		// Create another session
		const secondSession = await sessionManager.createSession(userId)
		const secondToken = secondSession.token

		// Verify both sessions work
		await sessionManager.verifySession(firstToken)
		await sessionManager.verifySession(secondToken)

		// Change password
		await passwordAuthManager.changePassword(userId, oldPassword, newPassword)

		// Both sessions should be revoked
		await expect(sessionManager.verifySession(firstToken)).rejects.toThrow()
		await expect(sessionManager.verifySession(secondToken)).rejects.toThrow()
	})

	// ====================================================================
	// SET PASSWORD (Admin Operation)
	// ====================================================================

	test('sets password directly (admin operation)', async () => {
		const email = 'adminsetpass@example.com'
		const initialPassword = 'InitialPass123!'
		const newPassword = 'AdminSetPass456!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password: initialPassword,
			name: 'Admin Set Pass User',
		})

		const userId = result.user.id

		// Admin sets new password
		await passwordAuthManager.setPassword(userId, newPassword)

		// Old password should not work
		await expect(
			passwordAuthManager.signInPassword({
				email,
				password: initialPassword,
			}),
		).rejects.toThrow(InvalidCredentialsError)

		// New password should work
		const signInResult = await passwordAuthManager.signInPassword({
			email,
			password: newPassword,
		})

		expect(signInResult.user.id).toBe(userId)
	})

	test('setPassword revokes all sessions', async () => {
		const email = 'setpassrevoke@example.com'
		const initialPassword = 'InitialPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password: initialPassword,
			name: 'Set Pass Revoke User',
		})

		const userId = result.user.id
		const token = result.session.token

		// Admin sets new password
		await passwordAuthManager.setPassword(userId, newPassword)

		// Session should be revoked
		await expect(sessionManager.verifySession(token)).rejects.toThrow()
	})

	test('setPassword rejects weak passwords', async () => {
		const userId = newUserId()

		await expect(
			passwordAuthManager.setPassword(userId, 'weak'),
		).rejects.toThrow(WeakPasswordError)
	})

	test('setPassword rejects for non-existent user', async () => {
		const nonExistentUserId = newUserId()
		const newPassword = 'NewPass123!'

		await expect(
			passwordAuthManager.setPassword(nonExistentUserId, newPassword),
		).rejects.toThrow(UserNotFoundError)
	})

	// ====================================================================
	// HAS PASSWORD CHECK
	// ====================================================================

	test('hasPassword returns true for user with password', async () => {
		const email = 'haspass@example.com'
		const password = 'SecurePass123!'

		// Create user
		const result = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Has Pass User',
		})

		const hasPassword = await passwordAuthManager.hasPassword(result.user.id)
		expect(hasPassword).toBe(true)
	})

	test('hasPassword returns false for user without password', async () => {
		const userId = newUserId()

		// Create user without password (OAuth-only user)
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'oauthonly@example.com',
				name: 'OAuth Only User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const hasPassword = await passwordAuthManager.hasPassword(userId)
		expect(hasPassword).toBe(false)
	})
})
