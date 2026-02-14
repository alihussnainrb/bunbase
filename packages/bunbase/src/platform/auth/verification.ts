/**
 * Email Verification Flows
 * Handles email verification for signup and email changes
 */

import type { DatabaseClient } from '../../db/client.ts'
import type { Logger } from '../../logger/index.ts'
import type { EmailSender } from '../email/sender.ts'
import type { UserId, AuthChallenge, ChallengeId } from '../core/types.ts'
import {
	InvalidTokenError,
	ChallengeExpiredError,
	EmailAlreadyExistsError,
	UserNotFoundError,
} from '../core/errors.ts'
import {
	generateVerificationToken,
	hashToken,
	constantTimeCompare,
	newChallengeId,
} from '../core/ids.ts'

// ====================================================================
// VERIFICATION MANAGER
// ====================================================================

/**
 * Email verification manager
 * Handles send and verify flows for email verification
 */
export class VerificationManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly emailSender: EmailSender,
		private readonly logger: Logger,
		private readonly baseUrl: string, // For generating verification links
	) {}

	// ====================================================================
	// SEND VERIFICATION EMAIL
	// ====================================================================

	/**
	 * Send email verification link to user
	 * Creates a challenge and sends email with verification URL
	 */
	async sendVerificationEmail(data: {
		email: string
		userId?: UserId
		userName?: string
	}): Promise<{ challengeId: ChallengeId }> {
		const { email, userId, userName = 'there' } = data

		// Generate secure token
		const token = generateVerificationToken()
		const tokenHash = await hashToken(token)
		const challengeId = newChallengeId()

		// Create challenge
		try {
			await this.db
				.from('auth_challenges')
				.insert({
					id: challengeId,
					type: 'email_verification',
					identifier: email.toLowerCase(),
					user_id: userId ?? null,
					token_hash: tokenHash,
					code_hash: null,
					expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
					attempts: 0,
					max_attempts: 5,
					verified_at: null,
					created_at: new Date().toISOString(),
				})

			// Generate verification URL
			const verificationUrl = `${this.baseUrl}/auth/verify-email?token=${token}`

			// Send verification email
			await this.emailSender.sendFromTemplate({
				templateKey: 'auth-verify-email',
				toEmail: email,
				variables: {
					userName,
					verificationUrl,
					expiresIn: '24 hours',
				},
				userId,
			})

			this.logger.info('Verification email sent', { challengeId, email, userId })

			return { challengeId }
		} catch (err) {
			this.logger.error('Failed to send verification email', {
				error: err,
				email,
				userId,
			})
			throw new Error('Failed to send verification email')
		}
	}

	// ====================================================================
	// VERIFY EMAIL
	// ====================================================================

	/**
	 * Verify email using verification token
	 * Marks challenge as verified and updates user email_verified_at
	 */
	async verifyEmail(token: string): Promise<{
		userId: UserId
		email: string
	}> {
		// Hash token for lookup
		const tokenHash = await hashToken(token)

		// Find challenge
		const challenge = await this.db
			.from('auth_challenges')
			.select('*')
			.eq('token_hash', tokenHash)
			.eq('type', 'email_verification')
			.isNull('verified_at')
			.maybeSingle()

		if (!challenge) {
			throw new InvalidTokenError('Invalid or expired verification token')
		}

		// Check expiration
		const expiresAt = new Date(challenge.expires_at as string)
		if (expiresAt < new Date()) {
			throw new ChallengeExpiredError({ challengeId: challenge.id })
		}

		const email = challenge.identifier as string
		const userId = challenge.user_id as UserId | null

		if (!userId) {
			// Challenge has no user (orphaned challenge)
			throw new InvalidTokenError('Invalid verification token')
		}

		try {
			// Mark challenge as verified
			await this.db
				.from('auth_challenges')
				.eq('id', challenge.id)
				.update({
					verified_at: new Date().toISOString(),
				})

			// Update user email_verified_at
			await this.db
				.from('users')
				.eq('id', userId)
				.update({
					email_verified_at: new Date().toISOString(),
				})

			this.logger.info('Email verified', { userId, email, challengeId: challenge.id })

			return { userId, email }
		} catch (err) {
			this.logger.error('Failed to verify email', {
				error: err,
				userId,
				email,
			})
			throw new Error('Failed to verify email')
		}
	}

	// ====================================================================
	// RESEND VERIFICATION
	// ====================================================================

	/**
	 * Resend verification email (invalidates previous challenges)
	 */
	async resendVerification(data: {
		email: string
		userId?: UserId
		userName?: string
	}): Promise<{ challengeId: ChallengeId }> {
		const { email, userId } = data

		// Invalidate previous challenges for this email
		await this.db
			.from('auth_challenges')
			.eq('identifier', email.toLowerCase())
			.eq('type', 'email_verification')
			.isNull('verified_at')
			.update({
				expires_at: new Date().toISOString(), // Expire immediately
			})

		// Send new verification email
		return this.sendVerificationEmail(data)
	}

	// ====================================================================
	// VERIFICATION STATUS
	// ====================================================================

	/**
	 * Check if an email is verified
	 */
	async isEmailVerified(email: string): Promise<boolean> {
		const user = await this.db
			.from('users')
			.select('email_verified_at')
			.eq('email', email.toLowerCase())
			.maybeSingle()

		return user?.email_verified_at !== null
	}

	/**
	 * Get verification status for a user
	 */
	async getVerificationStatus(userId: UserId): Promise<{
		emailVerified: boolean
		phoneVerified: boolean
	}> {
		const user = await this.db
			.from('users')
			.select('email_verified_at', 'phone_verified_at')
			.eq('id', userId)
			.maybeSingle()

		if (!user) {
			throw new UserNotFoundError(userId)
		}

		return {
			emailVerified: user.email_verified_at !== null,
			phoneVerified: user.phone_verified_at !== null,
		}
	}

	// ====================================================================
	// CHALLENGE CLEANUP
	// ====================================================================

	/**
	 * Clean up expired verification challenges (call periodically)
	 */
	async cleanupExpiredChallenges(): Promise<number> {
		try {
			const result = await this.db
				.from('auth_challenges')
				.eq('type', 'email_verification')
				.isNull('verified_at')
				.lt('expires_at', new Date().toISOString())
				.delete()

			const count = Array.isArray(result) ? result.length : 0
			this.logger.debug(`Cleaned up ${count} expired verification challenges`)

			return count
		} catch (err) {
			this.logger.error('Failed to cleanup expired challenges', { error: err })
			return 0
		}
	}
}
