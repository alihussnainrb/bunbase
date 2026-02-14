import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { OTPManager } from '../../../packages/bunbase/src/platform/auth/mfa/otp-manager.ts'
import { EmailSender } from '../../../packages/bunbase/src/platform/email/sender.ts'
import { TemplateManager } from '../../../packages/bunbase/src/platform/email/template-manager.ts'
import { TemplateRenderer } from '../../../packages/bunbase/src/platform/email/renderer.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import {
	InvalidCodeError,
	ChallengeExpiredError,
	TooManyAttemptsError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'

// Test mailer
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

describe('Platform: OTP Manager', () => {
	const env = createTestEnv()
	let otpManager: OTPManager
	let testMailer: TestMailer

	beforeAll(async () => {
		// Initialize test mailer
		testMailer = new TestMailer()

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

		// Initialize OTP manager
		otpManager = new OTPManager(env.db, emailSender, env.logger)

		// Seed OTP email template
		try {
			await env.db
				.from('email_templates')
				.insert({
					id: 'tmpl_otp_email',
					key: 'auth-otp-email',
					name: 'OTP Code',
					subject: 'Your verification code',
					html_body:
						'<p>Your verification code is: <strong>{{code}}</strong></p><p>This code expires in {{expiresIn}}.</p>',
					text_body: 'Your verification code is: {{code}} (expires in {{expiresIn}})',
					variables: ['code', 'expiresIn'],
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
	// REQUEST OTP
	// ====================================================================

	test('requests OTP via email', async () => {
		const email = 'otp@example.com'
		const userId = newUserId()

		testMailer.clear()

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
			userId,
		})

		expect(result.challengeId).toBeDefined()

		// Verify email was sent
		expect(testMailer.sentEmails.length).toBe(1)
		expect(testMailer.sentEmails[0].to).toBe(email)
		expect(testMailer.sentEmails[0].subject).toContain('verification code')
		expect(testMailer.sentEmails[0].html).toMatch(/\d{6}/) // Should contain 6-digit code

		// Verify challenge was created
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.type).toBe('otp_verification')
		expect(challenge.identifier).toBe(email.toLowerCase())
		expect(challenge.user_id).toBe(userId)

		// Verify OTP code was created
		const otpCode = await env.db
			.from('otp_codes')
			.select('*')
			.eq('challenge_id', result.challengeId)
			.single()

		expect(otpCode.delivery_method).toBe('email')
		expect(otpCode.recipient).toBe(email.toLowerCase())
		expect(otpCode.code_hash).toBeDefined()
	})

	test('requests OTP without user ID', async () => {
		const email = 'nouserid@example.com'

		testMailer.clear()

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
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

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
		})

		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.identifier).toBe('mixedcase@example.com')
	})

	test('sets custom expiration time', async () => {
		const email = 'custom@example.com'
		const expiresInSeconds = 600 // 10 minutes

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
			expiresInSeconds,
		})

		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		const expiresAt = new Date(challenge.expires_at as string)
		const expectedExpiry = new Date(Date.now() + expiresInSeconds * 1000)

		// Allow 5 second tolerance
		expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(
			5000,
		)
	})

	// ====================================================================
	// VERIFY OTP
	// ====================================================================

	test('verifies valid OTP code', async () => {
		const email = 'verify@example.com'
		const userId = newUserId()

		testMailer.clear()

		// Request OTP
		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
			userId,
		})

		// Extract code from email
		const sentEmail = testMailer.sentEmails[0]
		const codeMatch = sentEmail.html.match(/\d{6}/)
		expect(codeMatch).toBeDefined()
		const code = codeMatch![0]

		// Verify OTP
		const verifyResult = await otpManager.verifyOTP({
			challengeId: result.challengeId,
			code,
		})

		expect(verifyResult.valid).toBe(true)
		expect(verifyResult.userId).toBe(userId)
		expect(verifyResult.identifier).toBe(email.toLowerCase())

		// Challenge should be marked as verified
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.verified_at).not.toBeNull()

		// OTP code should be marked as verified
		const otpCode = await env.db
			.from('otp_codes')
			.select('*')
			.eq('challenge_id', result.challengeId)
			.single()

		expect(otpCode.verified_at).not.toBeNull()
	})

	test('rejects invalid OTP code', async () => {
		const email = 'invalid@example.com'

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
		})

		// Try with wrong code
		await expect(
			otpManager.verifyOTP({
				challengeId: result.challengeId,
				code: '999999',
			}),
		).rejects.toThrow(InvalidCodeError)
	})

	test('rejects expired OTP code', async () => {
		const email = 'expired@example.com'

		testMailer.clear()

		// Request OTP with 1 second expiration
		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
			expiresInSeconds: 1,
		})

		// Extract code from email
		const sentEmail = testMailer.sentEmails[0]
		const codeMatch = sentEmail.html.match(/\d{6}/)
		const code = codeMatch![0]

		// Wait for expiration
		await new Promise((resolve) => setTimeout(resolve, 1500))

		// Try to verify
		await expect(
			otpManager.verifyOTP({
				challengeId: result.challengeId,
				code,
			}),
		).rejects.toThrow(ChallengeExpiredError)
	})

	test('rejects already used OTP code', async () => {
		const email = 'used@example.com'

		testMailer.clear()

		// Request and verify OTP
		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
		})

		const sentEmail = testMailer.sentEmails[0]
		const codeMatch = sentEmail.html.match(/\d{6}/)
		const code = codeMatch![0]

		// Verify first time
		await otpManager.verifyOTP({
			challengeId: result.challengeId,
			code,
		})

		// Try to verify again
		await expect(
			otpManager.verifyOTP({
				challengeId: result.challengeId,
				code,
			}),
		).rejects.toThrow(InvalidCodeError)
	})

	test('enforces max attempts limit', async () => {
		const email = 'maxattempts@example.com'

		testMailer.clear()

		// Request OTP with max 3 attempts
		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
			maxAttempts: 3,
		})

		// Make 3 failed attempts
		for (let i = 0; i < 3; i++) {
			try {
				await otpManager.verifyOTP({
					challengeId: result.challengeId,
					code: '000000',
				})
			} catch {
				// Expected to fail
			}
		}

		// Fourth attempt should throw TooManyAttemptsError
		await expect(
			otpManager.verifyOTP({
				challengeId: result.challengeId,
				code: '000000',
			}),
		).rejects.toThrow(TooManyAttemptsError)
	})

	test('increments attempt count on failed verification', async () => {
		const email = 'attempts@example.com'

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
		})

		// Check initial attempts
		let challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.attempts).toBe(0)

		// Make failed attempt
		try {
			await otpManager.verifyOTP({
				challengeId: result.challengeId,
				code: '000000',
			})
		} catch {
			// Expected
		}

		// Check attempts increased
		challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.attempts).toBe(1)
	})

	// ====================================================================
	// RESEND OTP
	// ====================================================================

	test('resends OTP and invalidates previous', async () => {
		const email = 'resend@example.com'

		testMailer.clear()

		// Send first OTP
		const firstResult = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
		})

		expect(testMailer.sentEmails.length).toBe(1)

		testMailer.clear()

		// Resend OTP
		const secondResult = await otpManager.resendOTP({
			identifier: email,
			deliveryMethod: 'email',
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

		// Second challenge should be valid
		const secondChallenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', secondResult.challengeId)
			.single()

		const secondExpiresAt = new Date(secondChallenge.expires_at as string)
		expect(secondExpiresAt.getTime()).toBeGreaterThan(Date.now())
	})

	// ====================================================================
	// CLEANUP
	// ====================================================================

	test('cleans up expired OTP codes', async () => {
		const email1 = 'cleanup1@example.com'
		const email2 = 'cleanup2@example.com'

		// Create expired OTP
		const expiredResult = await otpManager.requestOTP({
			identifier: email1,
			deliveryMethod: 'email',
			expiresInSeconds: 1,
		})

		await new Promise((resolve) => setTimeout(resolve, 1500))

		// Create valid OTP
		const validResult = await otpManager.requestOTP({
			identifier: email2,
			deliveryMethod: 'email',
		})

		// Clean up
		const count = await otpManager.cleanupExpiredCodes()

		expect(count).toBeGreaterThanOrEqual(1)

		// Expired OTP should be gone
		const expiredOTP = await env.db
			.from('otp_codes')
			.select('*')
			.eq('challenge_id', expiredResult.challengeId)
			.maybeSingle()

		expect(expiredOTP).toBeNull()

		// Valid OTP should still exist
		const validOTP = await env.db
			.from('otp_codes')
			.select('*')
			.eq('challenge_id', validResult.challengeId)
			.maybeSingle()

		expect(validOTP).not.toBeNull()
	})

	// ====================================================================
	// GET OTP CODE
	// ====================================================================

	test('retrieves OTP code by challenge ID', async () => {
		const email = 'getcode@example.com'

		const result = await otpManager.requestOTP({
			identifier: email,
			deliveryMethod: 'email',
		})

		const otpCode = await otpManager.getOTPCode(result.challengeId)

		expect(otpCode).not.toBeNull()
		expect(otpCode!.challengeId).toBe(result.challengeId)
		expect(otpCode!.deliveryMethod).toBe('email')
		expect(otpCode!.recipient).toBe(email.toLowerCase())
	})
})
