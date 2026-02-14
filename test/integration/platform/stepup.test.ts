import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { StepUpManager } from '../../../packages/bunbase/src/platform/auth/mfa/stepup-manager.ts'
import { PasswordAuthManager } from '../../../packages/bunbase/src/platform/auth/password.ts'
import { SessionDBManager } from '../../../packages/bunbase/src/platform/auth/session-db.ts'
import { TOTPManager } from '../../../packages/bunbase/src/platform/auth/mfa/totp-manager.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import {
	InvalidCredentialsError,
	PlatformError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'
import { TOTP, Secret } from 'otpauth'

describe('Platform: Step-Up Authentication', () => {
	const env = createTestEnv()
	let stepUpManager: StepUpManager
	let passwordAuthManager: PasswordAuthManager
	let sessionManager: SessionDBManager
	let totpManager: TOTPManager

	beforeAll(async () => {
		// Initialize managers
		const secret = 'test-secret-key-for-stepup'
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
		totpManager = new TOTPManager(env.db, env.logger, 'TestApp')
		stepUpManager = new StepUpManager(
			env.db,
			passwordAuthManager,
			totpManager,
			env.logger,
		)
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	// ====================================================================
	// VERIFY STEP-UP WITH PASSWORD
	// ====================================================================

	test('verifies step-up with password', async () => {
		const email = 'stepup@example.com'
		const password = 'SecurePass123!'

		// Create user
		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Step-Up User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Verify step-up
		const result = await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'password',
			credential: password,
		})

		expect(result.valid).toBe(true)
		expect(result.stepUpSessionId).toBeDefined()
		expect(result.expiresAt).toBeInstanceOf(Date)
		expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())

		// Step-up session should be created
		const stepUpSession = await env.db
			.from('stepup_sessions')
			.select('*')
			.eq('id', result.stepUpSessionId)
			.single()

		expect(stepUpSession.user_id).toBe(userId)
		expect(stepUpSession.session_id).toBe(sessionId)
		expect(stepUpSession.method).toBe('password')
	})

	test('rejects step-up with wrong password', async () => {
		const email = 'wrongpass@example.com'
		const password = 'CorrectPass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Wrong Pass User',
		})

		await expect(
			stepUpManager.verifyStepUp({
				userId: user.user.id,
				sessionId: user.session.sessionId,
				method: 'password',
				credential: 'WrongPass123!',
			}),
		).rejects.toThrow(InvalidCredentialsError)
	})

	// ====================================================================
	// VERIFY STEP-UP WITH TOTP
	// ====================================================================

	test('verifies step-up with TOTP', async () => {
		const email = 'stepup-totp@example.com'
		const password = 'SecurePass123!'

		// Create user
		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'TOTP Step-Up User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Enroll TOTP
		const enrollResult = await totpManager.enrollTOTP({ userId })
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const enrollCode = totp.generate()
		await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code: enrollCode,
		})

		// Verify step-up with TOTP
		const authCode = totp.generate()
		const result = await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'totp',
			credential: authCode,
		})

		expect(result.valid).toBe(true)
		expect(result.stepUpSessionId).toBeDefined()

		// Step-up session should use TOTP method
		const stepUpSession = await env.db
			.from('stepup_sessions')
			.select('*')
			.eq('id', result.stepUpSessionId)
			.single()

		expect(stepUpSession.method).toBe('totp')
	})

	test('rejects step-up with invalid TOTP code', async () => {
		const email = 'invalid-totp@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Invalid TOTP User',
		})

		const userId = user.user.id

		// Enroll TOTP
		const enrollResult = await totpManager.enrollTOTP({ userId })
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const code = totp.generate()
		await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code,
		})

		// Try step-up with wrong code
		await expect(
			stepUpManager.verifyStepUp({
				userId,
				sessionId: user.session.sessionId,
				method: 'totp',
				credential: '000000',
			}),
		).rejects.toThrow(InvalidCredentialsError)
	})

	// ====================================================================
	// VERIFY STEP-UP WITH BACKUP CODE
	// ====================================================================

	test('verifies step-up with backup code', async () => {
		const email = 'stepup-backup@example.com'
		const password = 'SecurePass123!'

		// Create user
		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Backup Step-Up User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Generate backup codes
		const backupCodes = await totpManager.generateBackupCodes(userId, 10)

		// Verify step-up with backup code
		const result = await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'backup_code',
			credential: backupCodes[0],
		})

		expect(result.valid).toBe(true)
		expect(result.stepUpSessionId).toBeDefined()

		// Step-up session should use backup_code method
		const stepUpSession = await env.db
			.from('stepup_sessions')
			.select('*')
			.eq('id', result.stepUpSessionId)
			.single()

		expect(stepUpSession.method).toBe('backup_code')

		// Backup code should be marked as used
		const usedCodes = await env.db
			.from('mfa_backup_codes')
			.select('*')
			.eq('user_id', userId)
			.isNotNull('used_at')
			.exec()

		expect(usedCodes.length).toBe(1)
	})

	// ====================================================================
	// CHECK STEP-UP
	// ====================================================================

	test('checks valid step-up session', async () => {
		const email = 'check@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Check User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Create step-up session
		await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'password',
			credential: password,
		})

		// Check if valid
		const isValid = await stepUpManager.hasValidStepUp(userId, sessionId)

		expect(isValid).toBe(true)
	})

	test('returns false for non-existent step-up session', async () => {
		const userId = newUserId()
		const sessionId = 'fake-session-id'

		const isValid = await stepUpManager.hasValidStepUp(userId, sessionId)

		expect(isValid).toBe(false)
	})

	test('returns false for expired step-up session', async () => {
		const email = 'expired-stepup@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Expired Step-Up User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Create step-up session
		const result = await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'password',
			credential: password,
		})

		// Manually expire it
		await env.db
			.from('stepup_sessions')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(),
			})
			.eq('id', result.stepUpSessionId)
			.exec()

		// Check should return false
		const isValid = await stepUpManager.hasValidStepUp(userId, sessionId)

		expect(isValid).toBe(false)
	})

	test('enforces max age for step-up session', async () => {
		const email = 'maxage@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Max Age User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Create step-up session
		await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'password',
			credential: password,
		})

		// Check with 1 second max age
		await new Promise((resolve) => setTimeout(resolve, 1500))

		const isValid = await stepUpManager.hasValidStepUp(userId, sessionId, 1)

		expect(isValid).toBe(false)
	})

	// ====================================================================
	// REQUIRE STEP-UP
	// ====================================================================

	test('requires valid step-up session', async () => {
		const email = 'require@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Require User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Create step-up session
		await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'password',
			credential: password,
		})

		// Should not throw
		await expect(
			stepUpManager.requireStepUp(userId, sessionId),
		).resolves.toBeUndefined()
	})

	test('throws when step-up required but not present', async () => {
		const userId = newUserId()
		const sessionId = 'fake-session-id'

		await expect(
			stepUpManager.requireStepUp(userId, sessionId),
		).rejects.toThrow(PlatformError)
	})

	// ====================================================================
	// REVOKE STEP-UP
	// ====================================================================

	test('revokes specific step-up session', async () => {
		const email = 'revoke@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Revoke User',
		})

		const userId = user.user.id
		const sessionId = user.session.sessionId

		// Create step-up session
		const result = await stepUpManager.verifyStepUp({
			userId,
			sessionId,
			method: 'password',
			credential: password,
		})

		// Revoke it
		await stepUpManager.revokeStepUp(result.stepUpSessionId)

		// Should no longer be valid
		const isValid = await stepUpManager.hasValidStepUp(userId, sessionId)
		expect(isValid).toBe(false)

		// Should not exist in database
		const stepUpSession = await env.db
			.from('stepup_sessions')
			.select('*')
			.eq('id', result.stepUpSessionId)
			.maybeSingle()

		expect(stepUpSession).toBeNull()
	})

	test('revokes all step-up sessions for user', async () => {
		const email = 'revokeall@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Revoke All User',
		})

		const userId = user.user.id

		// Create multiple sessions
		const session1 = await sessionManager.createSession(userId)
		const session2 = await sessionManager.createSession(userId)

		// Create step-up sessions
		await stepUpManager.verifyStepUp({
			userId,
			sessionId: session1.sessionId,
			method: 'password',
			credential: password,
		})

		await stepUpManager.verifyStepUp({
			userId,
			sessionId: session2.sessionId,
			method: 'password',
			credential: password,
		})

		// Revoke all
		const count = await stepUpManager.revokeAllStepUp(userId)

		expect(count).toBe(2)

		// None should be valid
		const isValid1 = await stepUpManager.hasValidStepUp(userId, session1.sessionId)
		const isValid2 = await stepUpManager.hasValidStepUp(userId, session2.sessionId)

		expect(isValid1).toBe(false)
		expect(isValid2).toBe(false)
	})

	test('revokes all step-up sessions for specific session', async () => {
		const email = 'revokesession@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Revoke Session User',
		})

		const userId = user.user.id

		// Create two sessions
		const session1 = await sessionManager.createSession(userId)
		const session2 = await sessionManager.createSession(userId)

		// Create step-up sessions
		await stepUpManager.verifyStepUp({
			userId,
			sessionId: session1.sessionId,
			method: 'password',
			credential: password,
		})

		await stepUpManager.verifyStepUp({
			userId,
			sessionId: session2.sessionId,
			method: 'password',
			credential: password,
		})

		// Revoke only for session1
		const count = await stepUpManager.revokeAllStepUpForSession(session1.sessionId)

		expect(count).toBe(1)

		// Session1 should not be valid
		const isValid1 = await stepUpManager.hasValidStepUp(userId, session1.sessionId)
		expect(isValid1).toBe(false)

		// Session2 should still be valid
		const isValid2 = await stepUpManager.hasValidStepUp(userId, session2.sessionId)
		expect(isValid2).toBe(true)
	})

	// ====================================================================
	// LIST STEP-UP SESSIONS
	// ====================================================================

	test('lists active step-up sessions', async () => {
		const email = 'list-stepup@example.com'
		const password = 'SecurePass123!'

		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'List Step-Up User',
		})

		const userId = user.user.id

		// Create multiple sessions
		const session1 = await sessionManager.createSession(userId)
		const session2 = await sessionManager.createSession(userId)

		// Create step-up sessions
		await stepUpManager.verifyStepUp({
			userId,
			sessionId: session1.sessionId,
			method: 'password',
			credential: password,
		})

		await stepUpManager.verifyStepUp({
			userId,
			sessionId: session2.sessionId,
			method: 'password',
			credential: password,
		})

		// List step-up sessions
		const sessions = await stepUpManager.listStepUpSessions(userId)

		expect(sessions.length).toBe(2)
		expect(sessions[0].method).toBe('password')
		expect(sessions[1].method).toBe('password')
	})

	// ====================================================================
	// CLEANUP
	// ====================================================================

	test('cleans up expired step-up sessions', async () => {
		const email1 = 'cleanup1@example.com'
		const email2 = 'cleanup2@example.com'
		const password = 'SecurePass123!'

		// Create two users
		const user1 = await passwordAuthManager.signUpPassword({
			email: email1,
			password,
			name: 'Cleanup User 1',
		})

		const user2 = await passwordAuthManager.signUpPassword({
			email: email2,
			password,
			name: 'Cleanup User 2',
		})

		// Create expired step-up session
		const expiredResult = await stepUpManager.verifyStepUp({
			userId: user1.user.id,
			sessionId: user1.session.sessionId,
			method: 'password',
			credential: password,
		})

		await env.db
			.from('stepup_sessions')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(),
			})
			.eq('id', expiredResult.stepUpSessionId)
			.exec()

		// Create valid step-up session
		const validResult = await stepUpManager.verifyStepUp({
			userId: user2.user.id,
			sessionId: user2.session.sessionId,
			method: 'password',
			credential: password,
		})

		// Clean up
		const count = await stepUpManager.cleanupExpiredSessions()

		expect(count).toBeGreaterThanOrEqual(1)

		// Expired session should be gone
		const expiredSession = await env.db
			.from('stepup_sessions')
			.select('*')
			.eq('id', expiredResult.stepUpSessionId)
			.maybeSingle()

		expect(expiredSession).toBeNull()

		// Valid session should still exist
		const validSession = await env.db
			.from('stepup_sessions')
			.select('*')
			.eq('id', validResult.stepUpSessionId)
			.maybeSingle()

		expect(validSession).not.toBeNull()
	})
})
