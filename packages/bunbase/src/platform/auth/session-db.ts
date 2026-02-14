/**
 * Database-Backed Session Manager
 * Implements session persistence for revocation and tracking
 */

import type { DatabaseClient } from '../../db/client.ts'
import type { Logger } from '../../logger/index.ts'
import { SessionManager } from '../../auth/session.ts'
import type { Session, SessionId, SessionPayload, UserId } from '../core/types.ts'
import { InvalidSessionError, SessionRevokedError } from '../core/errors.ts'
import { hashToken, newSessionId } from '../core/ids.ts'

// ====================================================================
// SESSION DB MANAGER
// ====================================================================

/**
 * Session manager with database persistence for revocation and tracking
 * Combines HMAC-signed tokens (stateless) with database storage (revocation)
 */
export class SessionDBManager {
	private readonly sessionManager: SessionManager
	private readonly db: DatabaseClient
	private readonly logger: Logger

	constructor(
		secret: string,
		db: DatabaseClient,
		logger: Logger,
		cookieName = 'bunbase_session',
	) {
		this.sessionManager = new SessionManager({ secret, cookieName })
		this.db = db
		this.logger = logger
	}

	// ====================================================================
	// SESSION CREATION
	// ====================================================================

	/**
	 * Create a new session with database persistence
	 * Returns both the signed token and session ID
	 */
	async createSession(
		userId: UserId,
		metadata?: {
			ipAddress?: string
			userAgent?: string
			expiresInSeconds?: number
		},
	): Promise<{ token: string; sessionId: SessionId }> {
		const sessionId = newSessionId()
		const expiresInSeconds = metadata?.expiresInSeconds ?? 7 * 24 * 60 * 60 // 7 days

		// Create HMAC-signed token
		const payload: SessionPayload = {
			userId,
			sessionId,
			exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
		}
		const token = this.sessionManager.createSession(payload)

		// Hash token for database storage (never store plain tokens)
		const tokenHash = await hashToken(token)

		// Store session in database
		try {
			await this.db
				.from('auth_sessions')
				.insert({
					id: sessionId,
					user_id: userId,
					token_hash: tokenHash,
					ip_address: metadata?.ipAddress ?? null,
					user_agent: metadata?.userAgent ?? null,
					expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
					last_active_at: new Date().toISOString(),
					created_at: new Date().toISOString(),
					revoked_at: null,
					revoke_reason: null,
				})

			this.logger.debug(`Session created: ${sessionId}`, { userId, sessionId })
		} catch (err) {
			this.logger.error('Failed to create session in database', { error: err, userId })
			throw new Error('Failed to create session')
		}

		return { token, sessionId }
	}

	// ====================================================================
	// SESSION VERIFICATION
	// ====================================================================

	/**
	 * Verify a session token and check database status
	 * Throws if session is invalid, expired, or revoked
	 */
	async verifySession(token: string): Promise<SessionPayload & { sessionId: SessionId }> {
		// Verify HMAC signature and expiration
		const payload = this.sessionManager.verifySession(token)
		if (!payload) {
			throw new InvalidSessionError()
		}

		const sessionId = payload.sessionId as SessionId

		// Hash token for database lookup
		const tokenHash = await hashToken(token)

		// Check database status
		try {
			const session = await this.db
				.from('auth_sessions')
				.select('id', 'revoked_at', 'expires_at')
				.eq('token_hash', tokenHash)
				.maybeSingle()

			if (!session) {
				throw new InvalidSessionError({ sessionId })
			}

			// Check if revoked
			if (session.revoked_at) {
				throw new SessionRevokedError({ sessionId })
			}

			// Check expiration (database check as fallback)
			const expiresAt = new Date(session.expires_at as string)
			if (expiresAt < new Date()) {
				throw new InvalidSessionError({ sessionId, reason: 'expired' })
			}

			// Update last active timestamp (async, don't await)
			this.updateLastActive(sessionId).catch((err) => {
				this.logger.warn('Failed to update session last_active_at', {
					error: err,
					sessionId,
				})
			})

			return { userId: payload.userId, sessionId, role: payload.role, exp: payload.exp as number }
		} catch (err) {
			if (err instanceof InvalidSessionError || err instanceof SessionRevokedError) {
				throw err
			}
			this.logger.error('Failed to verify session in database', {
				error: err,
				sessionId,
			})
			throw new InvalidSessionError({ sessionId })
		}
	}

	/**
	 * Update last active timestamp for a session (fire-and-forget)
	 */
	private async updateLastActive(sessionId: SessionId): Promise<void> {
		await this.db
			.from('auth_sessions')
			.eq('id', sessionId)
			.update({
				last_active_at: new Date().toISOString(),
			})
	}

	// ====================================================================
	// SESSION LISTING
	// ====================================================================

	/**
	 * List all active sessions for a user
	 */
	async listSessions(userId: UserId): Promise<Session[]> {
		try {
			const rows = await this.db
				.from('auth_sessions')
				.eq('user_id', userId)
				.isNull('revoked_at')
				.orderBy('created_at', 'DESC')
				.select(
					'id',
					'user_id',
					'token_hash',
					'ip_address',
					'user_agent',
					'expires_at',
					'last_active_at',
					'created_at',
					'revoked_at',
					'revoke_reason',
				)
				.exec()

			return rows.map((row: any) => ({
				id: row.id as SessionId,
				userId: row.user_id as UserId,
				tokenHash: row.token_hash,
				ipAddress: row.ip_address,
				userAgent: row.user_agent,
				expiresAt: new Date(row.expires_at),
				lastActiveAt: new Date(row.last_active_at),
				createdAt: new Date(row.created_at),
				revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
				revokeReason: row.revoke_reason,
			}))
		} catch (err) {
			this.logger.error('Failed to list sessions', { error: err, userId })
			return []
		}
	}

	// ====================================================================
	// SESSION REVOCATION
	// ====================================================================

	/**
	 * Revoke a specific session by session ID
	 */
	async revokeSession(sessionId: SessionId, reason?: string): Promise<void> {
		try {
			await this.db
				.from('auth_sessions')
				.eq('id', sessionId)
				.update({
					revoked_at: new Date().toISOString(),
					revoke_reason: reason ?? 'User revoked',
				})

			this.logger.info(`Session revoked: ${sessionId}`, { sessionId, reason })
		} catch (err) {
			this.logger.error('Failed to revoke session', { error: err, sessionId })
			throw new Error('Failed to revoke session')
		}
	}

	/**
	 * Revoke all sessions for a user (except optionally the current one)
	 */
	async revokeAllSessions(
		userId: UserId,
		exceptSessionId?: SessionId,
	): Promise<number> {
		try {
			let query = this.db
				.from('auth_sessions')
				.eq('user_id', userId)
				.isNull('revoked_at')

			if (exceptSessionId) {
				query = query.neq('id', exceptSessionId)
			}

			const result = await query.update({
				revoked_at: new Date().toISOString(),
				revoke_reason: 'All sessions revoked by user',
			})

			const count = Array.isArray(result) ? result.length : 0
			this.logger.info(`Revoked ${count} sessions for user`, { userId, exceptSessionId })

			return count
		} catch (err) {
			this.logger.error('Failed to revoke all sessions', { error: err, userId })
			throw new Error('Failed to revoke sessions')
		}
	}

	/**
	 * Revoke a session by token (for logout)
	 */
	async revokeSessionByToken(token: string, reason?: string): Promise<void> {
		const tokenHash = await hashToken(token)

		try {
			await this.db
				.from('auth_sessions')
				.eq('token_hash', tokenHash)
				.update({
					revoked_at: new Date().toISOString(),
					revoke_reason: reason ?? 'User logged out',
				})

			this.logger.info('Session revoked by token', { reason })
		} catch (err) {
			this.logger.error('Failed to revoke session by token', { error: err })
			throw new Error('Failed to revoke session')
		}
	}

	// ====================================================================
	// SESSION CLEANUP
	// ====================================================================

	/**
	 * Clean up expired sessions (call periodically)
	 * Returns number of sessions deleted
	 */
	async cleanupExpiredSessions(): Promise<number> {
		try {
			const result = await this.db
				.from('auth_sessions')
				.lt('expires_at', new Date().toISOString())
				.delete()

			const count = Array.isArray(result) ? result.length : 0
			this.logger.debug(`Cleaned up ${count} expired sessions`)

			return count
		} catch (err) {
			this.logger.error('Failed to cleanup expired sessions', { error: err })
			return 0
		}
	}

	// ====================================================================
	// COOKIE HELPERS
	// ====================================================================

	/**
	 * Get the cookie name for sessions
	 */
	getCookieName(): string {
		return this.sessionManager.getCookieName()
	}
}
