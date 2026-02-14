import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { SessionDBManager } from '../../../packages/bunbase/src/platform/auth/session-db.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import { InvalidSessionError, SessionRevokedError } from '../../../packages/bunbase/src/platform/core/errors.ts'

describe('Platform: Session Manager', () => {
	const env = createTestEnv()
	let sessionManager: SessionDBManager

	beforeAll(async () => {
		// Initialize session manager
		const secret = 'test-secret-key-for-session-manager'
		sessionManager = new SessionDBManager(
			secret,
			env.db,
			env.logger,
			'test_session',
		)
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	test('creates a new session', async () => {
		const userId = newUserId()

		const { token, sessionId } = await sessionManager.createSession(userId, {
			ipAddress: '127.0.0.1',
			userAgent: 'Test Agent',
		})

		expect(token).toBeDefined()
		expect(typeof token).toBe('string')
		expect(sessionId).toBeDefined()

		// Verify session exists in database
		const sessions = await sessionManager.listSessions(userId)
		expect(sessions.length).toBe(1)
		expect(sessions[0].id).toBe(sessionId)
		expect(sessions[0].userId).toBe(userId)
		expect(sessions[0].ipAddress).toBe('127.0.0.1')
		expect(sessions[0].userAgent).toBe('Test Agent')
	})

	test('verifies a valid session', async () => {
		const userId = newUserId()

		const { token, sessionId } = await sessionManager.createSession(userId)

		const payload = await sessionManager.verifySession(token)

		expect(payload.userId).toBe(userId)
		expect(payload.sessionId).toBe(sessionId)
		expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
	})

	test('rejects invalid session token', async () => {
		const invalidToken = 'invalid-token-here'

		await expect(sessionManager.verifySession(invalidToken)).rejects.toThrow(
			InvalidSessionError,
		)
	})

	test('rejects expired session', async () => {
		const userId = newUserId()

		// Create session with 1 second expiration
		const { token } = await sessionManager.createSession(userId, {
			expiresInSeconds: 1,
		})

		// Wait for expiration
		await new Promise((resolve) => setTimeout(resolve, 1500))

		await expect(sessionManager.verifySession(token)).rejects.toThrow(
			InvalidSessionError,
		)
	})

	test('lists all sessions for a user', async () => {
		const userId = newUserId()

		// Create multiple sessions
		await sessionManager.createSession(userId, { ipAddress: '192.168.1.1' })
		await sessionManager.createSession(userId, { ipAddress: '192.168.1.2' })
		await sessionManager.createSession(userId, { ipAddress: '192.168.1.3' })

		const sessions = await sessionManager.listSessions(userId)

		expect(sessions.length).toBe(3)
		expect(sessions[0].ipAddress).toBe('192.168.1.3') // Most recent first
		expect(sessions[1].ipAddress).toBe('192.168.1.2')
		expect(sessions[2].ipAddress).toBe('192.168.1.1')
	})

	test('revokes a specific session', async () => {
		const userId = newUserId()

		const { token, sessionId } = await sessionManager.createSession(userId)

		// Verify session works before revocation
		await sessionManager.verifySession(token)

		// Revoke session
		await sessionManager.revokeSession(sessionId, 'Test revocation')

		// Verify session is now revoked
		await expect(sessionManager.verifySession(token)).rejects.toThrow(
			SessionRevokedError,
		)

		// Check revocation in database
		const sessions = await sessionManager.listSessions(userId)
		expect(sessions.length).toBe(0) // Revoked sessions are filtered out
	})

	test('revokes all sessions for a user', async () => {
		const userId = newUserId()

		// Create multiple sessions
		const { token: token1 } = await sessionManager.createSession(userId)
		const { token: token2 } = await sessionManager.createSession(userId)
		const { token: token3 } = await sessionManager.createSession(userId)

		// Revoke all sessions
		const count = await sessionManager.revokeAllSessions(userId)

		expect(count).toBe(3)

		// Verify all sessions are revoked
		await expect(sessionManager.verifySession(token1)).rejects.toThrow()
		await expect(sessionManager.verifySession(token2)).rejects.toThrow()
		await expect(sessionManager.verifySession(token3)).rejects.toThrow()

		// Check database
		const sessions = await sessionManager.listSessions(userId)
		expect(sessions.length).toBe(0)
	})

	test('revokes all sessions except current', async () => {
		const userId = newUserId()

		// Create multiple sessions
		const { token: token1, sessionId: session1 } = await sessionManager.createSession(userId)
		const { token: token2 } = await sessionManager.createSession(userId)
		const { token: token3 } = await sessionManager.createSession(userId)

		// Revoke all except first session
		const count = await sessionManager.revokeAllSessions(userId, session1)

		expect(count).toBe(2)

		// Verify first session still works
		await sessionManager.verifySession(token1)

		// Verify other sessions are revoked
		await expect(sessionManager.verifySession(token2)).rejects.toThrow()
		await expect(sessionManager.verifySession(token3)).rejects.toThrow()
	})

	test('revokes session by token', async () => {
		const userId = newUserId()

		const { token } = await sessionManager.createSession(userId)

		// Revoke by token
		await sessionManager.revokeSessionByToken(token, 'User logged out')

		// Verify session is revoked
		await expect(sessionManager.verifySession(token)).rejects.toThrow(
			SessionRevokedError,
		)
	})

	test('cleans up expired sessions', async () => {
		const userId = newUserId()

		// Create expired session
		const { token } = await sessionManager.createSession(userId, {
			expiresInSeconds: 1,
		})

		// Wait for expiration
		await new Promise((resolve) => setTimeout(resolve, 1500))

		// Create a valid session
		await sessionManager.createSession(userId, {
			expiresInSeconds: 3600,
		})

		// Clean up expired sessions
		const count = await sessionManager.cleanupExpiredSessions()

		expect(count).toBeGreaterThanOrEqual(1)

		// Verify expired session is gone
		await expect(sessionManager.verifySession(token)).rejects.toThrow()

		// Verify valid session still exists
		const sessions = await sessionManager.listSessions(userId)
		expect(sessions.length).toBe(1)
	})

	test('updates last active timestamp', async () => {
		const userId = newUserId()

		const { token, sessionId } = await sessionManager.createSession(userId)

		// Get initial timestamp
		const sessions1 = await sessionManager.listSessions(userId)
		const initialTimestamp = sessions1[0].lastActiveAt

		// Wait a bit
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify session (triggers lastActiveAt update)
		await sessionManager.verifySession(token)

		// Wait for async update to complete
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Get updated timestamp
		const sessions2 = await sessionManager.listSessions(userId)
		const updatedTimestamp = sessions2[0].lastActiveAt

		expect(updatedTimestamp.getTime()).toBeGreaterThanOrEqual(
			initialTimestamp.getTime(),
		)
	})

	test('returns correct cookie name', () => {
		const cookieName = sessionManager.getCookieName()
		expect(cookieName).toBe('test_session')
	})
})
