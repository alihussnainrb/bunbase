/**
 * TOTP Manager
 * Handles Time-Based One-Time Password (TOTP) enrollment and verification
 */

import { TOTP, Secret } from 'otpauth'
import QRCode from 'qrcode'
import type { DatabaseClient } from '../../../db/client.ts'
import type { Logger } from '../../../logger/index.ts'
import type { UserId, ChallengeId } from '../../core/types.ts'
import type {
	MFAFactor,
	MFAFactorStatus,
	TOTPEnrollmentData,
	TOTPEnrollmentResult,
	TOTPVerificationData,
	TOTPEnrollmentVerificationData,
	TOTPEnrollmentVerificationResult,
	TOTPAlgorithm,
} from './types.ts'
import {
	UserNotFoundError,
	InvalidCodeError,
	ChallengeExpiredError,
	PlatformError,
} from '../../core/errors.ts'
import { newChallengeId, hashCode } from '../../core/ids.ts'

// ====================================================================
// TOTP MANAGER
// ====================================================================

/**
 * Manages TOTP (authenticator app) enrollment and verification
 */
export class TOTPManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly logger: Logger,
		private readonly appName: string = 'Bunbase',
	) {}

	// ====================================================================
	// ENROLL TOTP
	// ====================================================================

	/**
	 * Start TOTP enrollment (generate secret and QR code)
	 */
	async enrollTOTP(data: TOTPEnrollmentData): Promise<TOTPEnrollmentResult> {
		const {
			userId,
			name = 'Authenticator App',
			algorithm = 'SHA1',
			digits = 6,
			period = 30,
		} = data

		// Verify user exists
		const user = await this.db
			.from('users')
			.select('email')
			.eq('id', userId)
			.maybeSingle()

		if (!user) {
			throw new UserNotFoundError(userId)
		}

		// Generate secret
		const secret = new Secret({ size: 32 }) // 32 bytes = 256 bits

		// Create TOTP instance
		const totp = new TOTP({
			issuer: this.appName,
			label: user.email || userId,
			algorithm,
			digits,
			period,
			secret,
		})

		// Generate OTPAuth URL for QR code
		const otpauthUrl = totp.toString()

		// Generate QR code
		const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
			errorCorrectionLevel: 'H',
			type: 'image/png',
			width: 300,
			margin: 2,
		})

		// Create enrollment challenge
		const challengeId = newChallengeId()
		const factorId = crypto.randomUUID()

		try {
			// Create challenge
			await this.db
				.from('auth_challenges')
				.insert({
					id: challengeId,
					type: 'totp_enrollment',
					identifier: userId,
					user_id: userId,
					token_hash: null,
					code_hash: null,
					expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
					attempts: 0,
					max_attempts: 5,
					verified_at: null,
					created_at: new Date().toISOString(),
				})
				.exec()

			// Create pending MFA factor
			await this.db
				.from('mfa_factors')
				.insert({
					id: factorId,
					user_id: userId,
					type: 'totp',
					name,
					secret: secret.base32, // Store base32-encoded secret
					algorithm,
					digits,
					period,
					status: 'pending',
					enrollment_challenge_id: challengeId,
					verified_at: null,
					last_used_at: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.exec()

			this.logger.info('TOTP enrollment started', {
				userId,
				factorId,
				challengeId,
			})

			return {
				factorId,
				secret: secret.base32,
				qrCodeDataUrl,
				challengeId,
				otpauthUrl,
			}
		} catch (err) {
			this.logger.error('Failed to start TOTP enrollment', {
				error: err,
				userId,
			})
			throw new Error('Failed to start TOTP enrollment')
		}
	}

	// ====================================================================
	// VERIFY TOTP ENROLLMENT
	// ====================================================================

	/**
	 * Verify TOTP enrollment by validating a code
	 */
	async verifyTOTPEnrollment(
		data: TOTPEnrollmentVerificationData,
	): Promise<TOTPEnrollmentVerificationResult> {
		const { challengeId, code } = data

		// Get challenge
		const challenge = await this.db
			.from('auth_challenges')
			.select('*')
			.eq('id', challengeId)
			.eq('type', 'totp_enrollment')
			.isNull('verified_at')
			.maybeSingle()

		if (!challenge) {
			throw new InvalidCodeError('Invalid or already verified enrollment')
		}

		// Check expiration
		const expiresAt = new Date(challenge.expires_at as string)
		if (expiresAt < new Date()) {
			throw new ChallengeExpiredError({ challengeId })
		}

		const userId = challenge.user_id as UserId

		// Get pending MFA factor
		const factor = await this.db
			.from('mfa_factors')
			.select('*')
			.eq('enrollment_challenge_id', challengeId)
			.eq('status', 'pending')
			.maybeSingle()

		if (!factor) {
			throw new InvalidCodeError('Enrollment factor not found')
		}

		// Verify TOTP code
		const isValid = this.verifyTOTPCode(
			factor.secret as string,
			code,
			{
				algorithm: factor.algorithm as TOTPAlgorithm,
				digits: factor.digits as number,
				period: factor.period as number,
			},
		)

		if (!isValid) {
			this.logger.warn('Invalid TOTP code during enrollment', {
				userId,
				factorId: factor.id,
			})
			throw new InvalidCodeError('Invalid verification code')
		}

		// Activate MFA factor
		await this.db
			.from('mfa_factors')
			.update({
				status: 'active',
				verified_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.eq('id', factor.id)
			.exec()

		// Mark challenge as verified
		await this.db
			.from('auth_challenges')
			.update({
				verified_at: new Date().toISOString(),
			})
			.eq('id', challengeId)
			.exec()

		// Generate backup codes
		const backupCodes = await this.generateBackupCodes(userId)

		this.logger.info('TOTP enrollment verified', {
			userId,
			factorId: factor.id,
		})

		return {
			factorId: factor.id,
			backupCodes,
		}
	}

	// ====================================================================
	// VERIFY TOTP
	// ====================================================================

	/**
	 * Verify TOTP code for authentication
	 */
	async verifyTOTP(data: TOTPVerificationData): Promise<{
		valid: boolean
		factorId: string
	}> {
		const { userId, code, factorId } = data

		// Get active TOTP factors
		let factors: any[]

		if (factorId) {
			// Verify specific factor
			const factor = await this.db
				.from('mfa_factors')
				.select('*')
				.eq('id', factorId)
				.eq('user_id', userId)
				.eq('status', 'active')
				.maybeSingle()

			factors = factor ? [factor] : []
		} else {
			// Try all active TOTP factors
			factors = await this.db
				.from('mfa_factors')
				.select('*')
				.eq('user_id', userId)
				.eq('type', 'totp')
				.eq('status', 'active')
				.exec()
		}

		if (factors.length === 0) {
			throw new PlatformError('No active TOTP factors found', 404)
		}

		// Try to verify with each factor
		for (const factor of factors) {
			const isValid = this.verifyTOTPCode(
				factor.secret as string,
				code,
				{
					algorithm: factor.algorithm as TOTPAlgorithm,
					digits: factor.digits as number,
					period: factor.period as number,
				},
			)

			if (isValid) {
				// Update last used timestamp
				await this.db
					.from('mfa_factors')
					.update({
						last_used_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.eq('id', factor.id)
					.exec()

				this.logger.info('TOTP verified', {
					userId,
					factorId: factor.id,
				})

				return {
					valid: true,
					factorId: factor.id,
				}
			}
		}

		this.logger.warn('Invalid TOTP code', { userId })
		throw new InvalidCodeError('Invalid verification code')
	}

	// ====================================================================
	// DISABLE TOTP
	// ====================================================================

	/**
	 * Disable TOTP factor
	 */
	async disableTOTP(userId: UserId, factorId: string): Promise<void> {
		// Verify factor belongs to user
		const factor = await this.db
			.from('mfa_factors')
			.select('id', 'status')
			.eq('id', factorId)
			.eq('user_id', userId)
			.maybeSingle()

		if (!factor) {
			throw new PlatformError('TOTP factor not found', 404)
		}

		// Disable factor
		await this.db
			.from('mfa_factors')
			.update({
				status: 'disabled',
				updated_at: new Date().toISOString(),
			})
			.eq('id', factorId)
			.exec()

		this.logger.info('TOTP disabled', { userId, factorId })
	}

	// ====================================================================
	// BACKUP CODES
	// ====================================================================

	/**
	 * Generate backup codes for user
	 */
	async generateBackupCodes(userId: UserId, count = 10): Promise<string[]> {
		// Delete existing unused backup codes
		await this.db
			.from('mfa_backup_codes')
			.delete()
			.eq('user_id', userId)
			.isNull('used_at')
			.exec()

		const codes: string[] = []
		const inserts: Array<{
			id: string
			user_id: UserId
			code_hash: string
			used_at: null
			created_at: string
		}> = []

		// Generate new backup codes
		for (let i = 0; i < count; i++) {
			const code = generateBackupCode()
			const codeHash = await hashCode(code)

			codes.push(code)
			inserts.push({
				id: crypto.randomUUID(),
				user_id: userId,
				code_hash: codeHash,
				used_at: null,
				created_at: new Date().toISOString(),
			})
		}

		// Store backup codes
		await this.db.from('mfa_backup_codes').insert(inserts).exec()

		this.logger.info('Backup codes generated', {
			userId,
			count,
		})

		return codes
	}

	/**
	 * Verify backup code
	 */
	async verifyBackupCode(
		userId: UserId,
		code: string,
	): Promise<{
		valid: boolean
		remainingCodes: number
	}> {
		const codeHash = await hashCode(code)

		// Find unused backup code
		const backupCode = await this.db
			.from('mfa_backup_codes')
			.select('*')
			.eq('user_id', userId)
			.eq('code_hash', codeHash)
			.isNull('used_at')
			.maybeSingle()

		if (!backupCode) {
			this.logger.warn('Invalid backup code', { userId })
			throw new InvalidCodeError('Invalid backup code')
		}

		// Mark as used
		await this.db
			.from('mfa_backup_codes')
			.update({
				used_at: new Date().toISOString(),
			})
			.eq('id', backupCode.id)
			.exec()

		// Count remaining codes
		const remaining = await this.db
			.from('mfa_backup_codes')
			.select('id')
			.eq('user_id', userId)
			.isNull('used_at')
			.exec()

		const remainingCodes = remaining.length

		this.logger.info('Backup code verified', {
			userId,
			remainingCodes,
		})

		return {
			valid: true,
			remainingCodes,
		}
	}

	/**
	 * Get remaining backup codes count
	 */
	async getRemainingBackupCodes(userId: UserId): Promise<number> {
		const remaining = await this.db
			.from('mfa_backup_codes')
			.select('id')
			.eq('user_id', userId)
			.isNull('used_at')
			.exec()

		return remaining.length
	}

	// ====================================================================
	// LIST FACTORS
	// ====================================================================

	/**
	 * List MFA factors for user
	 */
	async listFactors(userId: UserId): Promise<MFAFactor[]> {
		const rows = await this.db
			.from('mfa_factors')
			.select('*')
			.eq('user_id', userId)
			.orderBy('created_at', 'desc')
			.exec()

		return rows.map((row) => this.mapRowToFactor(row))
	}

	/**
	 * Get MFA factor by ID
	 */
	async getFactor(factorId: string): Promise<MFAFactor | null> {
		const row = await this.db
			.from('mfa_factors')
			.select('*')
			.eq('id', factorId)
			.maybeSingle()

		return row ? this.mapRowToFactor(row) : null
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Verify TOTP code
	 */
	private verifyTOTPCode(
		secretBase32: string,
		code: string,
		config: {
			algorithm?: TOTPAlgorithm
			digits?: number
			period?: number
		} = {},
	): boolean {
		const { algorithm = 'SHA1', digits = 6, period = 30 } = config

		try {
			const secret = Secret.fromBase32(secretBase32)
			const totp = new TOTP({
				secret,
				algorithm,
				digits,
				period,
			})

			// Verify with window of ±1 period to account for clock drift
			const delta = totp.validate({
				token: code,
				window: 1,
			})

			return delta !== null
		} catch (err) {
			this.logger.error('TOTP verification error', { error: err })
			return false
		}
	}

	/**
	 * Map database row to MFAFactor
	 */
	private mapRowToFactor(row: any): MFAFactor {
		return {
			id: row.id,
			userId: row.user_id as UserId,
			type: row.type,
			name: row.name,
			secret: row.secret,
			algorithm: row.algorithm as TOTPAlgorithm,
			digits: row.digits,
			period: row.period,
			status: row.status as MFAFactorStatus,
			enrollmentChallengeId: row.enrollment_challenge_id as ChallengeId | null,
			verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
			lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
		}
	}
}

// ====================================================================
// BACKUP CODE GENERATION
// ====================================================================

/**
 * Generate random backup code (8 characters, alphanumeric)
 */
function generateBackupCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
	const array = new Uint8Array(8)
	crypto.getRandomValues(array)

	let code = ''
	for (let i = 0; i < 8; i++) {
		code += chars[array[i] % chars.length]
	}

	return code
}
