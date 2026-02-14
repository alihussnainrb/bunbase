/**
 * Password Reset Flows
 * Handles forgot password and password reset with email verification
 */

import type { DatabaseClient } from '../../db/client.ts'
import type { Logger } from '../../logger/index.ts'
import type { EmailSender } from '../email/sender.ts'
import type { PasswordAuthManager } from './password.ts'
import type { UserId, ChallengeId } from '../core/types.ts'
import {
	InvalidTokenError,
	ChallengeExpiredError,
	TooManyAttemptsError,
	UserNotFoundError,
} from '../core/errors.ts'
import {
	generateVerificationToken,
	hashToken,
	constantTimeCompare,
	newChallengeId,
} from '../core/ids.ts'

// ====================================================================
// PASSWORD RESET MANAGER
// ====================================================================

/**
 * Password reset manager
 * Handles forgot password flow with email verification
 */
export class PasswordResetManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly emailSender: EmailSender,
		private readonly passwordAuthManager: PasswordAuthManager,
		private readonly logger: Logger,
		private readonly baseUrl: string, // For generating reset links
	) {}

	// ====================================================================
	// SEND RESET EMAIL
	// ====================================================================

	/**
	 * Send password reset email to user
	 * Creates a challenge and sends email with reset URL
	 */
	async sendPasswordResetEmail(email: string): Promise<{
		challengeId: ChallengeId
	}> {
		// Find user by email
		const user = await this.db
			.from('users')
			.select('id', 'name', 'status')
			.eq('email', email.toLowerCase())
			.maybeSingle()

		// Don't reveal if email exists (security best practice)
		if (!user) {
			this.logger.warn('Password reset requested for non-existent email', { email })
			// Still return success to prevent email enumeration
			return { challengeId: newChallengeId() }
		}

		const userId = user.id as UserId
		const userName = user.name || 'there'

		// Check if user is active
		if (user.status !== 'active') {
			this.logger.warn('Password reset requested for inactive user', {
				userId,
				status: user.status,
			})
			// Still return success
			return { challengeId: newChallengeId() }
		}

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
					type: 'password_reset',
					identifier: email.toLowerCase(),
					user_id: userId,
					token_hash: tokenHash,
					code_hash: null,
					expires_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour
					attempts: 0,
					max_attempts: 5,
					verified_at: null,
					created_at: new Date().toISOString(),
				})
				.exec()

			// Generate reset URL
			const resetUrl = `${this.baseUrl}/auth/reset-password?token=${token}`

			// Send password reset email
			await this.emailSender.sendFromTemplate({
				templateKey: 'auth-password-reset',
				toEmail: email,
				variables: {
					userName,
					resetUrl,
					expiresIn: '1 hour',
				},
				userId,
			})

			this.logger.info('Password reset email sent', {
				challengeId,
				email,
				userId,
			})

			return { challengeId }
		} catch (err) {
			this.logger.error('Failed to send password reset email', {
				error: err,
				email,
				userId,
			})
			throw new Error('Failed to send password reset email')
		}
	}

	// ====================================================================
	// VERIFY RESET TOKEN
	// ====================================================================

	/**
	 * Verify password reset token (before showing reset form)
	 * Returns user ID if token is valid
	 */
	async verifyResetToken(token: string): Promise<{
		userId: UserId
		email: string
		challengeId: ChallengeId
	}> {
		// Hash token for lookup
		const tokenHash = await hashToken(token)

		// Find challenge
		const challenge = await this.db
			.from('auth_challenges')
			.select('*')
			.eq('token_hash', tokenHash)
			.eq('type', 'password_reset')
			.isNull('verified_at')
			.maybeSingle()

		if (!challenge) {
			throw new InvalidTokenError('Invalid or expired reset token')
		}

		// Check expiration
		const expiresAt = new Date(challenge.expires_at as string)
		if (expiresAt < new Date()) {
			throw new ChallengeExpiredError({ challengeId: challenge.id })
		}

		// Check max attempts
		if ((challenge.attempts as number) >= (challenge.max_attempts as number)) {
			throw new TooManyAttemptsError({ challengeId: challenge.id })
		}

		const userId = challenge.user_id as UserId
		const email = challenge.identifier as string

		if (!userId) {
			throw new InvalidTokenError('Invalid reset token')
		}

		return {
			userId,
			email,
			challengeId: challenge.id as ChallengeId,
		}
	}

	// ====================================================================
	// RESET PASSWORD
	// ====================================================================

	/**
	 * Reset password using verification token
	 * Validates token, sets new password, and marks challenge as verified
	 */
	async resetPassword(
		token: string,
		newPassword: string,
	): Promise<{
		userId: UserId
	}> {
		// Verify token and get user info
		const { userId, email, challengeId } = await this.verifyResetToken(token)

		// Increment attempt count
		await this.db
			.from('auth_challenges')
			.update({
				attempts: (await this.db
					.from('auth_challenges')
					.select('attempts')
					.eq('id', challengeId)
					.single()).attempts + 1,
			})
			.eq('id', challengeId)
			.exec()

		try {
			// Set new password (this also revokes all sessions)
			await this.passwordAuthManager.setPassword(userId, newPassword)

			// Mark challenge as verified
			await this.db
				.from('auth_challenges')
				.update({
					verified_at: new Date().toISOString(),
				})
				.eq('id', challengeId)
				.exec()

			this.logger.info('Password reset successful', { userId, email, challengeId })

			return { userId }
		} catch (err) {
			this.logger.error('Failed to reset password', {
				error: err,
				userId,
				email,
			})
			throw new Error('Failed to reset password')
		}
	}

	// ====================================================================
	// RESEND RESET EMAIL
	// ====================================================================

	/**
	 * Resend password reset email (invalidates previous challenges)
	 */
	async resendPasswordReset(email: string): Promise<{
		challengeId: ChallengeId
	}> {
		// Invalidate previous challenges for this email
		await this.db
			.from('auth_challenges')
			.update({
				expires_at: new Date().toISOString(), // Expire immediately
			})
			.eq('identifier', email.toLowerCase())
			.eq('type', 'password_reset')
			.isNull('verified_at')
			.exec()

		// Send new reset email
		return this.sendPasswordResetEmail(email)
	}

	// ====================================================================
	// CHALLENGE CLEANUP
	// ====================================================================

	/**
	 * Clean up expired password reset challenges (call periodically)
	 */
	async cleanupExpiredChallenges(): Promise<number> {
		try {
			const result = await this.db
				.from('auth_challenges')
				.delete()
				.eq('type', 'password_reset')
				.isNull('verified_at')
				.lt('expires_at', new Date().toISOString())
				.exec()

			const count = Array.isArray(result) ? result.length : 0
			this.logger.debug(`Cleaned up ${count} expired password reset challenges`)

			return count
		} catch (err) {
			this.logger.error('Failed to cleanup expired reset challenges', {
				error: err,
			})
			return 0
		}
	}
}
