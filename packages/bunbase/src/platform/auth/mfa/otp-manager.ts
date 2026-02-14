/**
 * OTP Manager
 * Handles One-Time Password generation and verification (Email/SMS)
 */

import type { DatabaseClient } from '../../../db/client.ts'
import type { Logger } from '../../../logger/index.ts'
import type { EmailSender } from '../../email/sender.ts'
import type { UserId, ChallengeId } from '../../core/types.ts'
import type {
	OTPCode,
	OTPRequestData,
	OTPVerificationData,
	OTPVerificationResult,
	OTPDeliveryMethod,
} from './types.ts'
import {
	InvalidCodeError,
	ChallengeExpiredError,
	TooManyAttemptsError,
} from '../../core/errors.ts'
import { hashCode, constantTimeCompare, newChallengeId } from '../../core/ids.ts'

// ====================================================================
// OTP MANAGER
// ====================================================================

/**
 * Manages OTP code generation and verification
 * Supports email and SMS delivery
 */
export class OTPManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly emailSender: EmailSender,
		private readonly logger: Logger,
		// SMS sender would be added here when implemented
		// private readonly smsSender?: SMSSender,
	) {}

	// ====================================================================
	// REQUEST OTP
	// ====================================================================

	/**
	 * Request OTP code (send via email or SMS)
	 */
	async requestOTP(data: OTPRequestData): Promise<{
		challengeId: ChallengeId
	}> {
		const {
			identifier,
			deliveryMethod,
			userId,
			expiresInSeconds = 300, // 5 minutes default
			maxAttempts = 5,
		} = data

		// Generate 6-digit OTP code
		const code = generateOTPCode()
		const codeHash = await hashCode(code)
		const challengeId = newChallengeId()
		const otpId = crypto.randomUUID()
		const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

		try {
			// Create auth challenge
			await this.db
				.from('auth_challenges')
				.insert({
					id: challengeId,
					type: 'otp_verification',
					identifier: identifier.toLowerCase(),
					user_id: userId ?? null,
					token_hash: null,
					code_hash: codeHash,
					expires_at: expiresAt.toISOString(),
					attempts: 0,
					max_attempts: maxAttempts,
					verified_at: null,
					created_at: new Date().toISOString(),
				})

			// Create OTP code record
			await this.db
				.from('otp_codes')
				.insert({
					id: otpId,
					challenge_id: challengeId,
					delivery_method: deliveryMethod,
					recipient: identifier.toLowerCase(),
					code_hash: codeHash,
					attempts: 0,
					max_attempts: maxAttempts,
					expires_at: expiresAt.toISOString(),
					verified_at: null,
					created_at: new Date().toISOString(),
				})

			// Send OTP via appropriate channel
			if (deliveryMethod === 'email') {
				await this.sendOTPEmail(identifier, code, expiresInSeconds)
			} else if (deliveryMethod === 'sms') {
				await this.sendOTPSMS(identifier, code)
			}

			this.logger.info('OTP requested', {
				challengeId,
				deliveryMethod,
				recipient: identifier,
			})

			return { challengeId }
		} catch (err) {
			this.logger.error('Failed to request OTP', {
				error: err,
				deliveryMethod,
			})
			throw new Error('Failed to request OTP')
		}
	}

	// ====================================================================
	// VERIFY OTP
	// ====================================================================

	/**
	 * Verify OTP code
	 */
	async verifyOTP(
		data: OTPVerificationData,
	): Promise<OTPVerificationResult> {
		const { challengeId, code } = data

		// Get challenge
		const challenge = await this.db
			.from('auth_challenges')
			.select('*')
			.eq('id', challengeId)
			.eq('type', 'otp_verification')
			.isNull('verified_at')
			.maybeSingle()

		if (!challenge) {
			throw new InvalidCodeError({ reason: 'Invalid or already used OTP code' })
		}

		// Check expiration
		const expiresAt = new Date(challenge.expires_at as string)
		if (expiresAt < new Date()) {
			throw new ChallengeExpiredError({ challengeId })
		}

		// Check max attempts
		const attempts = challenge.attempts as number
		const maxAttempts = challenge.max_attempts as number

		if (attempts >= maxAttempts) {
			throw new TooManyAttemptsError({ challengeId })
		}

		// Increment attempt count
		await this.db
			.from('auth_challenges')
			.eq('id', challengeId)
			.update({
				attempts: attempts + 1,
			})

		// Verify code (timing-safe comparison)
		const storedCodeHash = challenge.code_hash as string
		const providedCodeHash = await hashCode(code)
		const isValid = constantTimeCompare(storedCodeHash, providedCodeHash)

		if (!isValid) {
			this.logger.warn('Invalid OTP code provided', {
				challengeId,
				attemptsRemaining: maxAttempts - attempts - 1,
			})
			throw new InvalidCodeError({ reason: 'Invalid OTP code' })
		}

		// Mark as verified
		await this.db
			.from('auth_challenges')
			.eq('id', challengeId)
			.update({
				verified_at: new Date().toISOString(),
			})

		await this.db
			.from('otp_codes')
			.eq('challenge_id', challengeId)
			.update({
				verified_at: new Date().toISOString(),
			})

		const userId = challenge.user_id as UserId | null
		const identifier = challenge.identifier as string

		this.logger.info('OTP verified successfully', {
			challengeId,
			userId,
		})

		return {
			valid: true,
			userId: userId ?? undefined,
			identifier,
		}
	}

	// ====================================================================
	// RESEND OTP
	// ====================================================================

	/**
	 * Resend OTP (invalidates previous codes)
	 */
	async resendOTP(data: OTPRequestData): Promise<{
		challengeId: ChallengeId
	}> {
		const { identifier, deliveryMethod } = data

		// Invalidate previous OTP codes for this identifier
		await this.db
			.from('auth_challenges')
			.eq('identifier', identifier.toLowerCase())
			.eq('type', 'otp_verification')
			.isNull('verified_at')
			.update({
				expires_at: new Date().toISOString(), // Expire immediately
			})

		// Request new OTP
		return this.requestOTP(data)
	}

	// ====================================================================
	// SEND OTP
	// ====================================================================

	/**
	 * Send OTP via email
	 */
	private async sendOTPEmail(
		email: string,
		code: string,
		expiresInSeconds: number,
	): Promise<void> {
		const expiresInMinutes = Math.ceil(expiresInSeconds / 60)

		await this.emailSender.sendFromTemplate({
			templateKey: 'auth-otp-email',
			toEmail: email,
			variables: {
				code,
				expiresIn: `${expiresInMinutes} minutes`,
			},
		})
	}

	/**
	 * Send OTP via SMS
	 * @todo Implement SMS sending (Twilio, etc.)
	 */
	private async sendOTPSMS(phone: string, code: string): Promise<void> {
		// Placeholder for SMS implementation
		this.logger.warn('SMS OTP not yet implemented', { phone })
		throw new Error('SMS OTP delivery not yet implemented')
	}

	// ====================================================================
	// CLEANUP
	// ====================================================================

	/**
	 * Clean up expired OTP codes
	 */
	async cleanupExpiredCodes(): Promise<number> {
		try {
			const result = await this.db
				.from('otp_codes')
				.lt('expires_at', new Date().toISOString())
				.delete()

			const count = Array.isArray(result) ? result.length : 0
			this.logger.debug(`Cleaned up ${count} expired OTP codes`)

			return count
		} catch (err) {
			this.logger.error('Failed to cleanup expired OTP codes', { error: err })
			return 0
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Get OTP code by challenge ID
	 */
	async getOTPCode(challengeId: ChallengeId): Promise<OTPCode | null> {
		const row = await this.db
			.from('otp_codes')
			.select('*')
			.eq('challenge_id', challengeId)
			.maybeSingle()

		return row ? this.mapRowToOTPCode(row) : null
	}

	/**
	 * Map database row to OTPCode
	 */
	private mapRowToOTPCode(row: any): OTPCode {
		return {
			id: row.id,
			challengeId: row.challenge_id as ChallengeId,
			deliveryMethod: row.delivery_method as OTPDeliveryMethod,
			recipient: row.recipient,
			codeHash: row.code_hash,
			attempts: row.attempts,
			maxAttempts: row.max_attempts,
			expiresAt: new Date(row.expires_at),
			verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
			createdAt: new Date(row.created_at),
		}
	}
}

// ====================================================================
// OTP CODE GENERATION
// ====================================================================

/**
 * Generate 6-digit OTP code
 * Uses crypto.getRandomValues for cryptographic randomness
 */
export function generateOTPCode(): string {
	const array = new Uint32Array(1)
	crypto.getRandomValues(array)

	// Generate 6-digit code (000000 to 999999)
	const code = array[0]! % 1000000
	return code.toString().padStart(6, '0')
}
