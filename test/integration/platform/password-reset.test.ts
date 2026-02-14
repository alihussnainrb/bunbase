import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { PasswordResetManager } from '../../../packages/bunbase/src/platform/auth/password-reset.ts'
import { PasswordAuthManager } from '../../../packages/bunbase/src/platform/auth/password.ts'
import { SessionDBManager } from '../../../packages/bunbase/src/platform/auth/session-db.ts'
import { EmailSender } from '../../../packages/bunbase/src/platform/email/sender.ts'
import { TemplateManager } from '../../../packages/bunbase/src/platform/email/template-manager.ts'
import { TemplateRenderer } from '../../../packages/bunbase/src/platform/email/renderer.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import {
	InvalidTokenError,
	ChallengeExpiredError,
	TooManyAttemptsError,
	InvalidCredentialsError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'

// Test mailer that stores sent emails in memory
class TestMailer {
	public sentEmails: Array<{
		from: string
		to: string
		subject: string
		html: string
		text?: string
	}> = []

	async send(options: {
		from: string
		to: string
		subject: string
		html: string
		text?: string
	}): Promise<void> {
		this.sentEmails.push(options)
	}

	clear() {
		this.sentEmails = []
	}
}

describe('Platform: Password Reset', () => {
	const env = createTestEnv()
	let passwordResetManager: PasswordResetManager
	let passwordAuthManager: PasswordAuthManager
	let sessionManager: SessionDBManager
	let testMailer: TestMailer

	beforeAll(async () => {
		// Initialize test mailer
		testMailer = new TestMailer()

		// Initialize session manager
		const secret = 'test-secret-key-for-password-reset'
		sessionManager = new SessionDBManager(
			secret,
			env.db,
			env.logger,
			'test_session',
		)

		// Initialize password auth manager
		passwordAuthManager = new PasswordAuthManager(
			env.db,
			sessionManager,
			env.logger,
		)

		// Initialize email system
		const templateManager = new TemplateManager(env.db, env.logger)
		const renderer = new TemplateRenderer(env.logger)
		const emailSender = new EmailSender(
			env.db,
			templateManager,
			renderer,
			testMailer as any,
			env.logger,
		)

		// Initialize password reset manager
		passwordResetManager = new PasswordResetManager(
			env.db,
			emailSender,
			passwordAuthManager,
			env.logger,
			'http://localhost:3000',
		)

		// Seed password reset email template if not present
		try {
			await env.db
				.from('email_templates')
				.insert({
					id: 'tmpl_reset_password',
					key: 'auth-password-reset',
					name: 'Password Reset',
					subject: 'Reset your password - {{appName}}',
					html_body:
						'<p>Hi {{userName}},</p><p>Click here to reset your password: <a href="{{resetUrl}}">Reset Password</a></p><p>This link expires in {{expiresIn}}.</p>',
					text_body:
						'Hi {{userName}}, Reset your password: {{resetUrl}} This link expires in {{expiresIn}}.',
					variables: ['userName', 'resetUrl', 'expiresIn', 'appName'],
					is_active: true,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.exec()
		} catch {
			// Template might already exist
		}
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	// ====================================================================
	// SEND RESET EMAIL
	// ====================================================================

	test('sends password reset email for existing user', async () => {
		const email = 'reset@example.com'
		const password = 'OldPass123!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Reset User',
		})

		testMailer.clear()

		// Request password reset
		const result = await passwordResetManager.sendPasswordResetEmail(email)

		expect(result.challengeId).toBeDefined()

		// Verify email was sent
		expect(testMailer.sentEmails.length).toBe(1)
		expect(testMailer.sentEmails[0].to).toBe(email)
		expect(testMailer.sentEmails[0].subject).toContain('Reset')
		expect(testMailer.sentEmails[0].html).toContain('Reset User')
		expect(testMailer.sentEmails[0].html).toContain('reset-password?token=')

		// Verify challenge was created
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge).toBeDefined()
		expect(challenge.type).toBe('password_reset')
		expect(challenge.identifier).toBe(email.toLowerCase())
		expect(challenge.token_hash).toBeDefined()
	})

	test('does not reveal if email does not exist (email enumeration protection)', async () => {
		const nonExistentEmail = 'nonexistent@example.com'

		testMailer.clear()

		// Request password reset for non-existent email
		const result =
			await passwordResetManager.sendPasswordResetEmail(nonExistentEmail)

		// Should return success (but no email sent)
		expect(result.challengeId).toBeDefined()

		// No email should be sent
		expect(testMailer.sentEmails.length).toBe(0)

		// No challenge should be created
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.maybeSingle()

		expect(challenge).toBeNull()
	})

	test('does not send reset email for suspended account', async () => {
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

		testMailer.clear()

		// Request password reset
		await passwordResetManager.sendPasswordResetEmail(email)

		// Should return success (but no email sent)
		expect(testMailer.sentEmails.length).toBe(0)
	})

	test('normalizes email to lowercase', async () => {
		const email = 'ResetMixedCase@Example.COM'
		const password = 'SecurePass123!'

		// Create user with lowercase
		await passwordAuthManager.signUpPassword({
			email: email.toLowerCase(),
			password,
			name: 'Mixed Case User',
		})

		testMailer.clear()

		// Request reset with mixed case
		const result = await passwordResetManager.sendPasswordResetEmail(email)

		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.identifier).toBe('resetmixedcase@example.com')
	})

	// ====================================================================
	// VERIFY RESET TOKEN
	// ====================================================================

	test('verifies valid reset token', async () => {
		const email = 'verifytoken@example.com'
		const password = 'OldPass123!'

		// Create user
		const user = await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Verify Token User',
		})

		testMailer.clear()

		// Send reset email
		await passwordResetManager.sendPasswordResetEmail(email)

		// Extract token from sent email
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		expect(tokenMatch).toBeDefined()
		const token = tokenMatch![1]

		// Verify token
		const result = await passwordResetManager.verifyResetToken(token)

		expect(result.userId).toBe(user.user.id)
		expect(result.email).toBe(email.toLowerCase())
		expect(result.challengeId).toBeDefined()
	})

	test('rejects invalid reset token', async () => {
		const invalidToken = 'invalid-token-12345'

		await expect(
			passwordResetManager.verifyResetToken(invalidToken),
		).rejects.toThrow(InvalidTokenError)
	})

	test('rejects expired reset token', async () => {
		const email = 'expiredtoken@example.com'
		const password = 'OldPass123!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Expired Token User',
		})

		testMailer.clear()

		// Send reset email
		const result = await passwordResetManager.sendPasswordResetEmail(email)

		// Manually expire the challenge
		await env.db
			.from('auth_challenges')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(),
			})
			.eq('id', result.challengeId)
			.exec()

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Try to verify
		await expect(
			passwordResetManager.verifyResetToken(token),
		).rejects.toThrow(ChallengeExpiredError)
	})

	test('rejects token after max attempts exceeded', async () => {
		const email = 'maxattempts@example.com'
		const password = 'OldPass123!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Max Attempts User',
		})

		testMailer.clear()

		// Send reset email
		const result = await passwordResetManager.sendPasswordResetEmail(email)

		// Set attempts to max
		await env.db
			.from('auth_challenges')
			.update({
				attempts: 5, // max_attempts is 5
			})
			.eq('id', result.challengeId)
			.exec()

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Try to verify
		await expect(
			passwordResetManager.verifyResetToken(token),
		).rejects.toThrow(TooManyAttemptsError)
	})

	// ====================================================================
	// RESET PASSWORD
	// ====================================================================

	test('resets password with valid token', async () => {
		const email = 'resetpass@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Reset Pass User',
		})

		testMailer.clear()

		// Send reset email
		await passwordResetManager.sendPasswordResetEmail(email)

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Reset password
		const result = await passwordResetManager.resetPassword(token, newPassword)

		expect(result.userId).toBeDefined()

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

		expect(signInResult.user.email).toBe(email.toLowerCase())
	})

	test('marks challenge as verified after password reset', async () => {
		const email = 'markverified@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Mark Verified User',
		})

		testMailer.clear()

		// Send reset email
		const sendResult = await passwordResetManager.sendPasswordResetEmail(email)

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Reset password
		await passwordResetManager.resetPassword(token, newPassword)

		// Challenge should be marked as verified
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', sendResult.challengeId)
			.single()

		expect(challenge.verified_at).not.toBeNull()
	})

	test('revokes all sessions after password reset', async () => {
		const email = 'revokesessions@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword = 'NewPass456!'

		// Create user
		const signUpResult = await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Revoke Sessions User',
		})

		const firstToken = signUpResult.session.token

		// Create another session
		const secondSession = await sessionManager.createSession(
			signUpResult.user.id,
		)
		const secondToken = secondSession.token

		// Verify both sessions work
		await sessionManager.verifySession(firstToken)
		await sessionManager.verifySession(secondToken)

		testMailer.clear()

		// Send reset email
		await passwordResetManager.sendPasswordResetEmail(email)

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Reset password
		await passwordResetManager.resetPassword(token, newPassword)

		// Both sessions should be revoked
		await expect(sessionManager.verifySession(firstToken)).rejects.toThrow()
		await expect(sessionManager.verifySession(secondToken)).rejects.toThrow()
	})

	test('cannot reuse reset token', async () => {
		const email = 'reuse@example.com'
		const oldPassword = 'OldPass123!'
		const newPassword1 = 'NewPass456!'
		const newPassword2 = 'NewPass789!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password: oldPassword,
			name: 'Reuse Token User',
		})

		testMailer.clear()

		// Send reset email
		await passwordResetManager.sendPasswordResetEmail(email)

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Reset password first time
		await passwordResetManager.resetPassword(token, newPassword1)

		// Try to reset again with same token
		await expect(
			passwordResetManager.resetPassword(token, newPassword2),
		).rejects.toThrow(InvalidTokenError)

		// First new password should still work
		const signInResult = await passwordAuthManager.signInPassword({
			email,
			password: newPassword1,
		})

		expect(signInResult.user.email).toBe(email.toLowerCase())
	})

	test('increments attempt count on verification', async () => {
		const email = 'attempts@example.com'
		const password = 'OldPass123!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Attempts User',
		})

		testMailer.clear()

		// Send reset email
		const sendResult = await passwordResetManager.sendPasswordResetEmail(email)

		// Extract token
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Check initial attempts
		let challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', sendResult.challengeId)
			.single()

		expect(challenge.attempts).toBe(0)

		// Verify token (this increments attempts)
		await passwordResetManager.verifyResetToken(token)

		// Check attempts after verification
		challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', sendResult.challengeId)
			.single()

		expect(challenge.attempts).toBeGreaterThan(0)
	})

	// ====================================================================
	// RESEND RESET EMAIL
	// ====================================================================

	test('resends password reset email', async () => {
		const email = 'resend@example.com'
		const password = 'OldPass123!'

		// Create user
		await passwordAuthManager.signUpPassword({
			email,
			password,
			name: 'Resend User',
		})

		testMailer.clear()

		// Send first reset
		const firstResult =
			await passwordResetManager.sendPasswordResetEmail(email)

		expect(testMailer.sentEmails.length).toBe(1)

		testMailer.clear()

		// Resend reset
		const secondResult = await passwordResetManager.resendPasswordReset(email)

		expect(testMailer.sentEmails.length).toBe(1)
		expect(secondResult.challengeId).not.toBe(firstResult.challengeId)

		// First challenge should be expired
		const firstChallenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', firstResult.challengeId)
			.single()

		const expiresAt = new Date(firstChallenge.expires_at as string)
		expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now())
	})

	// ====================================================================
	// CLEANUP EXPIRED CHALLENGES
	// ====================================================================

	test('cleans up expired password reset challenges', async () => {
		const email1 = 'cleanup1@example.com'
		const email2 = 'cleanup2@example.com'
		const password = 'SecurePass123!'

		// Create users
		await passwordAuthManager.signUpPassword({
			email: email1,
			password,
			name: 'Cleanup User 1',
		})
		await passwordAuthManager.signUpPassword({
			email: email2,
			password,
			name: 'Cleanup User 2',
		})

		// Create expired challenge
		const expiredResult =
			await passwordResetManager.sendPasswordResetEmail(email1)

		await env.db
			.from('auth_challenges')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(),
			})
			.eq('id', expiredResult.challengeId)
			.exec()

		// Create valid challenge
		const validResult = await passwordResetManager.sendPasswordResetEmail(email2)

		// Clean up
		const count = await passwordResetManager.cleanupExpiredChallenges()

		expect(count).toBeGreaterThanOrEqual(1)

		// Expired challenge should be gone
		const expiredChallenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', expiredResult.challengeId)
			.maybeSingle()

		expect(expiredChallenge).toBeNull()

		// Valid challenge should still exist
		const validChallenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', validResult.challengeId)
			.maybeSingle()

		expect(validChallenge).not.toBeNull()
	})
})
