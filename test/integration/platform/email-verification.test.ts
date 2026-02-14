import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { VerificationManager } from '../../../packages/bunbase/src/platform/auth/verification.ts'
import { EmailSender } from '../../../packages/bunbase/src/platform/email/sender.ts'
import { TemplateManager } from '../../../packages/bunbase/src/platform/email/template-manager.ts'
import { TemplateRenderer } from '../../../packages/bunbase/src/platform/email/renderer.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import {
	InvalidTokenError,
	ChallengeExpiredError,
	UserNotFoundError,
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

describe('Platform: Email Verification', () => {
	const env = createTestEnv()
	let verificationManager: VerificationManager
	let testMailer: TestMailer
	let emailSender: EmailSender

	beforeAll(async () => {
		// Initialize test mailer
		testMailer = new TestMailer()

		// Initialize email system
		const templateManager = new TemplateManager(env.db, env.logger)
		const renderer = new TemplateRenderer(env.logger)
		emailSender = new EmailSender(
			env.db,
			templateManager,
			renderer,
			testMailer as any,
			env.logger,
		)

		// Initialize verification manager
		verificationManager = new VerificationManager(
			env.db,
			emailSender,
			env.logger,
			'http://localhost:3000',
		)

		// Seed default email templates if not already present
		// This would normally be done by migrations, but for testing we'll ensure they exist
		try {
			await env.db
				.from('email_templates')
				.insert({
					id: 'tmpl_verify_email',
					key: 'auth-verify-email',
					name: 'Email Verification',
					subject: 'Verify your email - {{appName}}',
					html_body:
						'<p>Hi {{userName}},</p><p>Please verify your email by clicking: <a href="{{verificationUrl}}">Verify Email</a></p><p>This link expires in {{expiresIn}}.</p>',
					text_body:
						'Hi {{userName}}, Please verify your email: {{verificationUrl}} This link expires in {{expiresIn}}.',
					variables: ['userName', 'verificationUrl', 'expiresIn', 'appName'],
					is_active: true,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.exec()
		} catch {
			// Template might already exist from previous test runs
		}
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	// ====================================================================
	// SEND VERIFICATION EMAIL
	// ====================================================================

	test('sends verification email', async () => {
		const email = 'verify@example.com'
		const userId = newUserId()

		testMailer.clear()

		const result = await verificationManager.sendVerificationEmail({
			email,
			userId,
			userName: 'Test User',
		})

		expect(result.challengeId).toBeDefined()

		// Verify email was sent
		expect(testMailer.sentEmails.length).toBe(1)
		expect(testMailer.sentEmails[0].to).toBe(email)
		expect(testMailer.sentEmails[0].subject).toContain('Verify')
		expect(testMailer.sentEmails[0].html).toContain('Test User')
		expect(testMailer.sentEmails[0].html).toContain('verify-email?token=')

		// Verify challenge was created
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge).toBeDefined()
		expect(challenge.type).toBe('email_verification')
		expect(challenge.identifier).toBe(email.toLowerCase())
		expect(challenge.user_id).toBe(userId)
		expect(challenge.token_hash).toBeDefined()
	})

	test('sends verification email without userId', async () => {
		const email = 'nouserid@example.com'

		testMailer.clear()

		const result = await verificationManager.sendVerificationEmail({
			email,
			userName: 'Guest User',
		})

		expect(result.challengeId).toBeDefined()
		expect(testMailer.sentEmails.length).toBe(1)

		// Verify challenge has no user_id
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.user_id).toBeNull()
	})

	test('normalizes email to lowercase', async () => {
		const email = 'MixedCase@Example.COM'
		const userId = newUserId()

		const result = await verificationManager.sendVerificationEmail({
			email,
			userId,
		})

		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.identifier).toBe('mixedcase@example.com')
	})

	// ====================================================================
	// VERIFY EMAIL
	// ====================================================================

	test('verifies email with valid token', async () => {
		const email = 'validtoken@example.com'
		const userId = newUserId()

		// Create user
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: email.toLowerCase(),
				name: 'Valid Token User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Send verification email
		testMailer.clear()
		await verificationManager.sendVerificationEmail({
			email,
			userId,
		})

		// Extract token from sent email
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		expect(tokenMatch).toBeDefined()
		const token = tokenMatch![1]

		// Verify email
		const result = await verificationManager.verifyEmail(token)

		expect(result.userId).toBe(userId)
		expect(result.email).toBe(email.toLowerCase())

		// Verify user email_verified_at is set
		const user = await env.db
			.from('users')
			.select('email_verified_at')
			.eq('id', userId)
			.single()

		expect(user.email_verified_at).not.toBeNull()

		// Verify challenge is marked as verified
		const challenges = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('identifier', email.toLowerCase())
			.eq('type', 'email_verification')
			.exec()

		const verifiedChallenge = challenges.find((c) => c.verified_at !== null)
		expect(verifiedChallenge).toBeDefined()
	})

	test('rejects invalid verification token', async () => {
		const invalidToken = 'invalid-token-12345'

		await expect(
			verificationManager.verifyEmail(invalidToken),
		).rejects.toThrow(InvalidTokenError)
	})

	test('rejects expired verification token', async () => {
		const email = 'expiredtoken@example.com'
		const userId = newUserId()

		// Create user
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: email.toLowerCase(),
				name: 'Expired Token User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Send verification email
		testMailer.clear()
		const result = await verificationManager.sendVerificationEmail({
			email,
			userId,
		})

		// Manually expire the challenge
		await env.db
			.from('auth_challenges')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
			})
			.eq('id', result.challengeId)
			.exec()

		// Extract token from sent email
		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Try to verify
		await expect(verificationManager.verifyEmail(token)).rejects.toThrow(
			ChallengeExpiredError,
		)
	})

	test('rejects already verified token', async () => {
		const email = 'alreadyverified@example.com'
		const userId = newUserId()

		// Create user
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: email.toLowerCase(),
				name: 'Already Verified User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Send and verify
		testMailer.clear()
		await verificationManager.sendVerificationEmail({ email, userId })

		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		// Verify first time
		await verificationManager.verifyEmail(token)

		// Try to verify again
		await expect(verificationManager.verifyEmail(token)).rejects.toThrow(
			InvalidTokenError,
		)
	})

	// ====================================================================
	// RESEND VERIFICATION
	// ====================================================================

	test('resends verification email', async () => {
		const email = 'resend@example.com'
		const userId = newUserId()

		// Create user
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: email.toLowerCase(),
				name: 'Resend User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Send first verification
		testMailer.clear()
		const firstResult = await verificationManager.sendVerificationEmail({
			email,
			userId,
		})

		expect(testMailer.sentEmails.length).toBe(1)

		// Resend verification
		testMailer.clear()
		const secondResult = await verificationManager.resendVerification({
			email,
			userId,
		})

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
	// VERIFICATION STATUS
	// ====================================================================

	test('checks if email is verified', async () => {
		const email = 'checkverified@example.com'
		const userId = newUserId()

		// Create user without verification
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: email.toLowerCase(),
				name: 'Check Verified User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Should not be verified initially
		let isVerified = await verificationManager.isEmailVerified(email)
		expect(isVerified).toBe(false)

		// Verify email
		testMailer.clear()
		await verificationManager.sendVerificationEmail({ email, userId })

		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		await verificationManager.verifyEmail(token)

		// Should be verified now
		isVerified = await verificationManager.isEmailVerified(email)
		expect(isVerified).toBe(true)
	})

	test('gets verification status for user', async () => {
		const email = 'getstatus@example.com'
		const userId = newUserId()

		// Create user
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: email.toLowerCase(),
				name: 'Get Status User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Get initial status
		let status = await verificationManager.getVerificationStatus(userId)
		expect(status.emailVerified).toBe(false)
		expect(status.phoneVerified).toBe(false)

		// Verify email
		testMailer.clear()
		await verificationManager.sendVerificationEmail({ email, userId })

		const sentEmail = testMailer.sentEmails[0]
		const tokenMatch = sentEmail.html.match(/token=([a-zA-Z0-9_-]+)/)
		const token = tokenMatch![1]

		await verificationManager.verifyEmail(token)

		// Get updated status
		status = await verificationManager.getVerificationStatus(userId)
		expect(status.emailVerified).toBe(true)
		expect(status.phoneVerified).toBe(false)
	})

	test('getVerificationStatus throws for non-existent user', async () => {
		const nonExistentUserId = newUserId()

		await expect(
			verificationManager.getVerificationStatus(nonExistentUserId),
		).rejects.toThrow(UserNotFoundError)
	})

	// ====================================================================
	// CLEANUP EXPIRED CHALLENGES
	// ====================================================================

	test('cleans up expired verification challenges', async () => {
		const email1 = 'cleanup1@example.com'
		const email2 = 'cleanup2@example.com'
		const userId1 = newUserId()
		const userId2 = newUserId()

		// Create expired challenge
		const expiredResult = await verificationManager.sendVerificationEmail({
			email: email1,
			userId: userId1,
		})

		await env.db
			.from('auth_challenges')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(),
			})
			.eq('id', expiredResult.challengeId)
			.exec()

		// Create valid challenge
		const validResult = await verificationManager.sendVerificationEmail({
			email: email2,
			userId: userId2,
		})

		// Clean up
		const count = await verificationManager.cleanupExpiredChallenges()

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
