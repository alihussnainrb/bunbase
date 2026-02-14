import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createTestEnv, cleanupTestEnv } from '../setup.ts'
import { TOTPManager } from '../../../packages/bunbase/src/platform/auth/mfa/totp-manager.ts'
import { newUserId } from '../../../packages/bunbase/src/platform/core/ids.ts'
import {
	InvalidCodeError,
	ChallengeExpiredError,
	UserNotFoundError,
	PlatformError,
} from '../../../packages/bunbase/src/platform/core/errors.ts'
import { TOTP, Secret } from 'otpauth'

describe('Platform: TOTP Manager', () => {
	const env = createTestEnv()
	let totpManager: TOTPManager

	beforeAll(async () => {
		// Initialize TOTP manager
		totpManager = new TOTPManager(env.db, env.logger, 'TestApp')
	})

	afterAll(async () => {
		await cleanupTestEnv(env)
	})

	// ====================================================================
	// ENROLL TOTP
	// ====================================================================

	test('enrolls TOTP factor', async () => {
		const userId = newUserId()

		// Create user
		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'totp@example.com',
				name: 'TOTP User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll TOTP
		const result = await totpManager.enrollTOTP({
			userId,
			name: 'My Authenticator',
		})

		expect(result.factorId).toBeDefined()
		expect(result.secret).toBeDefined()
		expect(result.qrCodeDataUrl).toBeDefined()
		expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)
		expect(result.challengeId).toBeDefined()
		expect(result.otpauthUrl).toBeDefined()
		expect(result.otpauthUrl).toContain('otpauth://totp/')

		// Verify challenge was created
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', result.challengeId)
			.single()

		expect(challenge.type).toBe('totp_enrollment')
		expect(challenge.user_id).toBe(userId)

		// Verify pending factor was created
		const factor = await env.db
			.from('mfa_factors')
			.select('*')
			.eq('id', result.factorId)
			.single()

		expect(factor.user_id).toBe(userId)
		expect(factor.type).toBe('totp')
		expect(factor.name).toBe('My Authenticator')
		expect(factor.status).toBe('pending')
		expect(factor.secret).toBe(result.secret)
		expect(factor.enrollment_challenge_id).toBe(result.challengeId)
	})

	test('enrolls TOTP with custom configuration', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'custom@example.com',
				name: 'Custom User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const result = await totpManager.enrollTOTP({
			userId,
			algorithm: 'SHA256',
			digits: 8,
			period: 60,
		})

		const factor = await env.db
			.from('mfa_factors')
			.select('*')
			.eq('id', result.factorId)
			.single()

		expect(factor.algorithm).toBe('SHA256')
		expect(factor.digits).toBe(8)
		expect(factor.period).toBe(60)
	})

	test('rejects enrollment for non-existent user', async () => {
		const nonExistentUserId = newUserId()

		await expect(
			totpManager.enrollTOTP({
				userId: nonExistentUserId,
			}),
		).rejects.toThrow(UserNotFoundError)
	})

	// ====================================================================
	// VERIFY TOTP ENROLLMENT
	// ====================================================================

	test('verifies TOTP enrollment with valid code', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'verify@example.com',
				name: 'Verify User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll
		const enrollResult = await totpManager.enrollTOTP({
			userId,
		})

		// Generate valid TOTP code
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 })
		const code = totp.generate()

		// Verify enrollment
		const verifyResult = await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code,
		})

		expect(verifyResult.factorId).toBe(enrollResult.factorId)
		expect(verifyResult.backupCodes).toHaveLength(10)
		expect(verifyResult.backupCodes[0]).toMatch(/^[A-Z0-9]{8}$/)

		// Factor should be active
		const factor = await env.db
			.from('mfa_factors')
			.select('*')
			.eq('id', enrollResult.factorId)
			.single()

		expect(factor.status).toBe('active')
		expect(factor.verified_at).not.toBeNull()

		// Challenge should be verified
		const challenge = await env.db
			.from('auth_challenges')
			.select('*')
			.eq('id', enrollResult.challengeId)
			.single()

		expect(challenge.verified_at).not.toBeNull()

		// Backup codes should be stored
		const backupCodes = await env.db
			.from('mfa_backup_codes')
			.select('*')
			.eq('user_id', userId)
			.exec()

		expect(backupCodes.length).toBe(10)
	})

	test('rejects enrollment verification with invalid code', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'invalid@example.com',
				name: 'Invalid User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const enrollResult = await totpManager.enrollTOTP({
			userId,
		})

		await expect(
			totpManager.verifyTOTPEnrollment({
				challengeId: enrollResult.challengeId,
				code: '000000',
			}),
		).rejects.toThrow(InvalidCodeError)
	})

	test('rejects enrollment verification after expiration', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'expired@example.com',
				name: 'Expired User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const enrollResult = await totpManager.enrollTOTP({
			userId,
		})

		// Manually expire the challenge
		await env.db
			.from('auth_challenges')
			.update({
				expires_at: new Date(Date.now() - 1000).toISOString(),
			})
			.eq('id', enrollResult.challengeId)
			.exec()

		// Generate valid code
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const code = totp.generate()

		await expect(
			totpManager.verifyTOTPEnrollment({
				challengeId: enrollResult.challengeId,
				code,
			}),
		).rejects.toThrow(ChallengeExpiredError)
	})

	// ====================================================================
	// VERIFY TOTP
	// ====================================================================

	test('verifies TOTP for authentication', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'auth@example.com',
				name: 'Auth User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll and verify
		const enrollResult = await totpManager.enrollTOTP({ userId })
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const enrollCode = totp.generate()
		await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code: enrollCode,
		})

		// Now verify for authentication
		const authCode = totp.generate()
		const verifyResult = await totpManager.verifyTOTP({
			userId,
			code: authCode,
		})

		expect(verifyResult.valid).toBe(true)
		expect(verifyResult.factorId).toBe(enrollResult.factorId)

		// Last used timestamp should be updated
		const factor = await env.db
			.from('mfa_factors')
			.select('*')
			.eq('id', enrollResult.factorId)
			.single()

		expect(factor.last_used_at).not.toBeNull()
	})

	test('verifies specific TOTP factor', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'specific@example.com',
				name: 'Specific User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll and verify
		const enrollResult = await totpManager.enrollTOTP({ userId })
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const enrollCode = totp.generate()
		await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code: enrollCode,
		})

		// Verify with specific factor ID
		const authCode = totp.generate()
		const verifyResult = await totpManager.verifyTOTP({
			userId,
			code: authCode,
			factorId: enrollResult.factorId,
		})

		expect(verifyResult.valid).toBe(true)
		expect(verifyResult.factorId).toBe(enrollResult.factorId)
	})

	test('rejects invalid TOTP code for authentication', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'invalidauth@example.com',
				name: 'Invalid Auth User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll and verify
		const enrollResult = await totpManager.enrollTOTP({ userId })
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const enrollCode = totp.generate()
		await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code: enrollCode,
		})

		// Try with wrong code
		await expect(
			totpManager.verifyTOTP({
				userId,
				code: '000000',
			}),
		).rejects.toThrow(InvalidCodeError)
	})

	test('rejects verification with no active factors', async () => {
		const userId = newUserId()

		await expect(
			totpManager.verifyTOTP({
				userId,
				code: '123456',
			}),
		).rejects.toThrow(PlatformError)
	})

	// ====================================================================
	// DISABLE TOTP
	// ====================================================================

	test('disables TOTP factor', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'disable@example.com',
				name: 'Disable User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll and verify
		const enrollResult = await totpManager.enrollTOTP({ userId })
		const secret = Secret.fromBase32(enrollResult.secret)
		const totp = new TOTP({ secret })
		const code = totp.generate()
		await totpManager.verifyTOTPEnrollment({
			challengeId: enrollResult.challengeId,
			code,
		})

		// Disable factor
		await totpManager.disableTOTP(userId, enrollResult.factorId)

		// Factor should be disabled
		const factor = await env.db
			.from('mfa_factors')
			.select('*')
			.eq('id', enrollResult.factorId)
			.single()

		expect(factor.status).toBe('disabled')
	})

	test('rejects disabling non-existent factor', async () => {
		const userId = newUserId()
		const fakeFactorId = crypto.randomUUID()

		await expect(
			totpManager.disableTOTP(userId, fakeFactorId),
		).rejects.toThrow(PlatformError)
	})

	// ====================================================================
	// BACKUP CODES
	// ====================================================================

	test('generates backup codes', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'backup@example.com',
				name: 'Backup User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const codes = await totpManager.generateBackupCodes(userId, 10)

		expect(codes).toHaveLength(10)
		expect(codes[0]).toMatch(/^[A-Z0-9]{8}$/)

		// All codes should be unique
		const uniqueCodes = new Set(codes)
		expect(uniqueCodes.size).toBe(10)

		// Codes should be stored in database
		const storedCodes = await env.db
			.from('mfa_backup_codes')
			.select('*')
			.eq('user_id', userId)
			.exec()

		expect(storedCodes.length).toBe(10)
	})

	test('replaces old unused backup codes when generating new ones', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'replace@example.com',
				name: 'Replace User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Generate first set
		const firstCodes = await totpManager.generateBackupCodes(userId, 10)

		// Generate second set
		const secondCodes = await totpManager.generateBackupCodes(userId, 10)

		// Should have exactly 10 codes (old ones replaced)
		const storedCodes = await env.db
			.from('mfa_backup_codes')
			.select('*')
			.eq('user_id', userId)
			.isNull('used_at')
			.exec()

		expect(storedCodes.length).toBe(10)

		// First codes should not be in second set
		const intersection = firstCodes.filter((code) =>
			secondCodes.includes(code),
		)
		expect(intersection.length).toBe(0)
	})

	test('verifies backup code', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'verifybackup@example.com',
				name: 'Verify Backup User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const codes = await totpManager.generateBackupCodes(userId, 10)

		// Verify first code
		const result = await totpManager.verifyBackupCode(userId, codes[0])

		expect(result.valid).toBe(true)
		expect(result.remainingCodes).toBe(9)

		// Code should be marked as used
		const usedCode = await env.db
			.from('mfa_backup_codes')
			.select('*')
			.eq('user_id', userId)
			.isNotNull('used_at')
			.exec()

		expect(usedCode.length).toBe(1)
	})

	test('rejects already used backup code', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'usedbackup@example.com',
				name: 'Used Backup User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const codes = await totpManager.generateBackupCodes(userId, 10)

		// Use code once
		await totpManager.verifyBackupCode(userId, codes[0])

		// Try to use again
		await expect(
			totpManager.verifyBackupCode(userId, codes[0]),
		).rejects.toThrow(InvalidCodeError)
	})

	test('rejects invalid backup code', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'invalidbackup@example.com',
				name: 'Invalid Backup User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		await totpManager.generateBackupCodes(userId, 10)

		await expect(
			totpManager.verifyBackupCode(userId, 'INVALID1'),
		).rejects.toThrow(InvalidCodeError)
	})

	test('gets remaining backup codes count', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'remaining@example.com',
				name: 'Remaining User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const codes = await totpManager.generateBackupCodes(userId, 10)

		// Initial count
		let remaining = await totpManager.getRemainingBackupCodes(userId)
		expect(remaining).toBe(10)

		// Use one code
		await totpManager.verifyBackupCode(userId, codes[0])

		// Count should decrease
		remaining = await totpManager.getRemainingBackupCodes(userId)
		expect(remaining).toBe(9)
	})

	// ====================================================================
	// LIST FACTORS
	// ====================================================================

	test('lists MFA factors for user', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'list@example.com',
				name: 'List User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		// Enroll and verify two factors
		const enroll1 = await totpManager.enrollTOTP({
			userId,
			name: 'Factor 1',
		})
		const secret1 = Secret.fromBase32(enroll1.secret)
		const totp1 = new TOTP({ secret: secret1 })
		await totpManager.verifyTOTPEnrollment({
			challengeId: enroll1.challengeId,
			code: totp1.generate(),
		})

		const enroll2 = await totpManager.enrollTOTP({
			userId,
			name: 'Factor 2',
		})
		const secret2 = Secret.fromBase32(enroll2.secret)
		const totp2 = new TOTP({ secret: secret2 })
		await totpManager.verifyTOTPEnrollment({
			challengeId: enroll2.challengeId,
			code: totp2.generate(),
		})

		// List factors
		const factors = await totpManager.listFactors(userId)

		expect(factors).toHaveLength(2)
		expect(factors[0].name).toBe('Factor 2') // Most recent first
		expect(factors[1].name).toBe('Factor 1')
		expect(factors[0].status).toBe('active')
	})

	test('gets specific factor by ID', async () => {
		const userId = newUserId()

		await env.db
			.from('users')
			.insert({
				id: userId,
				email: 'getfactor@example.com',
				name: 'Get Factor User',
				status: 'active',
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.exec()

		const enrollResult = await totpManager.enrollTOTP({
			userId,
			name: 'Test Factor',
		})

		const factor = await totpManager.getFactor(enrollResult.factorId)

		expect(factor).not.toBeNull()
		expect(factor!.id).toBe(enrollResult.factorId)
		expect(factor!.name).toBe('Test Factor')
	})
})
