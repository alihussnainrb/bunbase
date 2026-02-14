/**
 * Step-Up Authentication Manager
 * Handles step-up authentication for sensitive operations
 */

import type { DatabaseClient } from '../../../db/client.ts'
import type { Logger } from '../../../logger/index.ts'
import type { PasswordAuthManager } from '../password.ts'
import type { TOTPManager } from './totp-manager.ts'
import type { UserId } from '../../core/types.ts'
import type {
	StepUpSession,
	StepUpVerificationData,
	StepUpVerificationResult,
	StepUpMethod,
} from './types.ts'
import { InvalidCredentialsError, PlatformError } from '../../core/errors.ts'

// ====================================================================
// STEP-UP AUTHENTICATION MANAGER
// ====================================================================

/**
 * Manages step-up authentication for sensitive operations
 * Requires users to re-verify their identity before critical actions
 */
export class StepUpManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly passwordAuthManager: PasswordAuthManager,
		private readonly totpManager: TOTPManager,
		private readonly logger: Logger,
	) {}

	// ====================================================================
	// VERIFY STEP-UP
	// ====================================================================

	/**
	 * Verify step-up authentication
	 * Creates a temporary step-up session on success
	 */
	async verifyStepUp(
		data: StepUpVerificationData,
	): Promise<StepUpVerificationResult> {
		const { userId, sessionId, method, credential } = data

		// Verify based on method
		let verified = false

		if (method === 'password') {
			verified = await this.verifyPassword(userId, credential)
		} else if (method === 'totp') {
			verified = await this.verifyTOTP(userId, credential)
		} else if (method === 'backup_code') {
			verified = await this.verifyBackupCode(userId, credential)
		} else {
			throw new PlatformError(`Unsupported step-up method: ${method}`, 400)
		}

		if (!verified) {
			throw new InvalidCredentialsError()
		}

		// Create step-up session
		const stepUpSessionId = crypto.randomUUID()
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

		await this.db
			.from('stepup_sessions')
			.insert({
				id: stepUpSessionId,
				user_id: userId,
				session_id: sessionId,
				method,
				expires_at: expiresAt.toISOString(),
				created_at: new Date().toISOString(),
			})

		this.logger.info('Step-up authentication verified', {
			userId,
			sessionId,
			method,
			stepUpSessionId,
		})

		return {
			valid: true,
			stepUpSessionId,
			expiresAt,
		}
	}

	// ====================================================================
	// CHECK STEP-UP
	// ====================================================================

	/**
	 * Check if user has valid step-up session
	 */
	async hasValidStepUp(
		userId: UserId,
		sessionId: string,
		maxAgeSeconds?: number,
	): Promise<boolean> {
		const row = await this.db
			.from('stepup_sessions')
			.eq('user_id', userId)
			.eq('session_id', sessionId)
			.gt('expires_at', new Date().toISOString())
			.orderBy('created_at', 'DESC')
			.limit(1)
			.select('*')
			.maybeSingle()

		if (!row) {
			return false
		}

		// Check max age if specified
		if (maxAgeSeconds !== undefined) {
			const createdAt = new Date(row.created_at as string)
			const ageSeconds = (Date.now() - createdAt.getTime()) / 1000

			if (ageSeconds > maxAgeSeconds) {
				return false
			}
		}

		return true
	}

	/**
	 * Require valid step-up session
	 * @throws {PlatformError} If no valid step-up session
	 */
	async requireStepUp(
		userId: UserId,
		sessionId: string,
		maxAgeSeconds?: number,
	): Promise<void> {
		const isValid = await this.hasValidStepUp(userId, sessionId, maxAgeSeconds)

		if (!isValid) {
			throw new PlatformError(
				'Step-up authentication required for this operation',
				403,
				{ requireStepUp: true },
			)
		}
	}

	// ====================================================================
	// REVOKE STEP-UP
	// ====================================================================

	/**
	 * Revoke step-up session
	 */
	async revokeStepUp(stepUpSessionId: string): Promise<void> {
		await this.db
			.from('stepup_sessions')
			.eq('id', stepUpSessionId)
			.delete()

		this.logger.debug('Step-up session revoked', { stepUpSessionId })
	}

	/**
	 * Revoke all step-up sessions for user
	 */
	async revokeAllStepUp(userId: UserId): Promise<number> {
		const result = await this.db
			.from('stepup_sessions')
			.eq('user_id', userId)
			.delete()

		const count = Array.isArray(result) ? result.length : 0
		this.logger.debug('All step-up sessions revoked', { userId, count })

		return count
	}

	/**
	 * Revoke all step-up sessions for specific session
	 */
	async revokeAllStepUpForSession(sessionId: string): Promise<number> {
		const result = await this.db
			.from('stepup_sessions')
			.eq('session_id', sessionId)
			.delete()

		const count = Array.isArray(result) ? result.length : 0
		this.logger.debug('Step-up sessions revoked for session', {
			sessionId,
			count,
		})

		return count
	}

	// ====================================================================
	// CLEANUP
	// ====================================================================

	/**
	 * Clean up expired step-up sessions
	 */
	async cleanupExpiredSessions(): Promise<number> {
		try {
			const result = await this.db
				.from('stepup_sessions')
				.lt('expires_at', new Date().toISOString())
				.delete()

			const count = Array.isArray(result) ? result.length : 0
			this.logger.debug(`Cleaned up ${count} expired step-up sessions`)

			return count
		} catch (err) {
			this.logger.error('Failed to cleanup expired step-up sessions', {
				error: err,
			})
			return 0
		}
	}

	// ====================================================================
	// LIST STEP-UP SESSIONS
	// ====================================================================

	/**
	 * List active step-up sessions for user
	 */
	async listStepUpSessions(userId: UserId): Promise<StepUpSession[]> {
		const rows = await this.db
			.from('stepup_sessions')
			.eq('user_id', userId)
			.gt('expires_at', new Date().toISOString())
			.orderBy('created_at', 'DESC')
			.select('*')
			.exec()

		return rows.map((row) => this.mapRowToStepUpSession(row))
	}

	// ====================================================================
	// VERIFICATION METHODS
	// ====================================================================

	/**
	 * Verify password for step-up
	 */
	private async verifyPassword(
		userId: UserId,
		password: string,
	): Promise<boolean> {
		try {
			// Get user's password credential
			const credential = await this.db
				.from('credentials_password')
				.select('password_hash')
				.eq('user_id', userId)
				.maybeSingle()

			if (!credential) {
				return false
			}

			// Verify password
			const { verifyPassword } = await import('../../../auth/password.ts')
			return await verifyPassword(password, credential.password_hash as string)
		} catch (err) {
			this.logger.error('Step-up password verification failed', {
				error: err,
				userId,
			})
			return false
		}
	}

	/**
	 * Verify TOTP for step-up
	 */
	private async verifyTOTP(userId: UserId, code: string): Promise<boolean> {
		try {
			const result = await this.totpManager.verifyTOTP({
				userId,
				code,
			})
			return result.valid
		} catch (err) {
			this.logger.warn('Step-up TOTP verification failed', {
				userId,
				error: err,
			})
			return false
		}
	}

	/**
	 * Verify backup code for step-up
	 */
	private async verifyBackupCode(
		userId: UserId,
		code: string,
	): Promise<boolean> {
		try {
			const result = await this.totpManager.verifyBackupCode(userId, code)
			return result.valid
		} catch (err) {
			this.logger.warn('Step-up backup code verification failed', {
				userId,
				error: err,
			})
			return false
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Map database row to StepUpSession
	 */
	private mapRowToStepUpSession(row: any): StepUpSession {
		return {
			id: row.id,
			userId: row.user_id as UserId,
			sessionId: row.session_id,
			method: row.method as StepUpMethod,
			expiresAt: new Date(row.expires_at),
			createdAt: new Date(row.created_at),
		}
	}
}
