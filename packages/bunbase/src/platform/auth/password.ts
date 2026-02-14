/**
 * Password Authentication Flows
 * Handles signup, signin, and signout with password credentials
 */

import type { DatabaseClient } from '../../db/client.ts'
import type { Logger } from '../../logger/index.ts'
import { hashPassword, verifyPassword } from '../../auth/password.ts'
import type { SessionDBManager } from './session-db.ts'
import type { User, UserId } from '../core/types.ts'
import {
	EmailAlreadyExistsError,
	InvalidCredentialsError,
	AccountSuspendedError,
	AccountDeletedError,
	WeakPasswordError,
	InvalidEmailError,
} from '../core/errors.ts'
import { newUserId, isValidEmail } from '../core/ids.ts'

// ====================================================================
// PASSWORD AUTH MANAGER
// ====================================================================

/**
 * Password authentication manager
 * Handles signup, signin, and signout flows
 */
export class PasswordAuthManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly sessionManager: SessionDBManager,
		private readonly logger: Logger,
	) {}

	// ====================================================================
	// SIGN UP
	// ====================================================================

	/**
	 * Sign up a new user with email and password
	 * Creates user, password credential, and initial session
	 */
	async signUpPassword(data: {
		email: string
		password: string
		name?: string
		metadata?: Record<string, unknown>
		ipAddress?: string
		userAgent?: string
	}): Promise<{
		user: User
		session: { token: string; sessionId: string }
	}> {
		const { email, password, name, metadata, ipAddress, userAgent } = data

		// Validate email format
		if (!isValidEmail(email)) {
			throw new InvalidEmailError(email)
		}

		// Validate password strength (minimum 8 characters)
		if (password.length < 8) {
			throw new WeakPasswordError('Password must be at least 8 characters long')
		}

		// Check if email already exists
		const existingUser = await this.db
			.from('users')
			.select('id')
			.eq('email', email.toLowerCase())
			.maybeSingle()

		if (existingUser) {
			throw new EmailAlreadyExistsError(email)
		}

		// Generate user ID
		const userId = newUserId()

		// Hash password
		const passwordHash = await hashPassword(password)

		// Start transaction - create user, credential, and session atomically
		try {
			// Create user
			const [userRow] = await this.db
				.from('users')
				.insert({
					id: userId,
					email: email.toLowerCase(),
					name: name ?? null,
					status: 'active',
					metadata: metadata ? JSON.stringify(metadata) : '{}',
					email_verified_at: null,
					phone_verified_at: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					last_sign_in_at: new Date().toISOString(),
					deleted_at: null,
				})
				.returning('*')
				.exec()

			// Create password credential
			await this.db
				.from('credentials_password')
				.insert({
					id: crypto.randomUUID(),
					user_id: userId,
					password_hash: passwordHash,
					changed_at: new Date().toISOString(),
					created_at: new Date().toISOString(),
				})
				.exec()

			// Create session
			const session = await this.sessionManager.createSession(userId, {
				ipAddress,
				userAgent,
			})

			// Map database row to User type
			const user = this.mapRowToUser(userRow)

			this.logger.info('User signed up', { userId, email })

			return { user, session }
		} catch (err) {
			this.logger.error('Failed to sign up user', { error: err, email })
			throw new Error('Failed to create account')
		}
	}

	// ====================================================================
	// SIGN IN
	// ====================================================================

	/**
	 * Sign in with email and password
	 * Validates credentials and creates new session
	 */
	async signInPassword(data: {
		email: string
		password: string
		ipAddress?: string
		userAgent?: string
	}): Promise<{
		user: User
		session: { token: string; sessionId: string }
	}> {
		const { email, password, ipAddress, userAgent } = data

		// Find user by email
		const userRow = await this.db
			.from('users')
			.select('*')
			.eq('email', email.toLowerCase())
			.maybeSingle()

		if (!userRow) {
			// Use generic error to prevent email enumeration
			throw new InvalidCredentialsError()
		}

		const userId = userRow.id as UserId

		// Check account status
		if (userRow.status === 'suspended') {
			throw new AccountSuspendedError({ userId })
		}

		if (userRow.status === 'deleted' || userRow.deleted_at) {
			throw new AccountDeletedError({ userId })
		}

		// Get password credential
		const credentialRow = await this.db
			.from('credentials_password')
			.select('password_hash')
			.eq('user_id', userId)
			.maybeSingle()

		if (!credentialRow) {
			// User exists but has no password (OAuth-only account)
			throw new InvalidCredentialsError()
		}

		// Verify password
		const isValid = await verifyPassword(password, credentialRow.password_hash as string)

		if (!isValid) {
			this.logger.warn('Failed sign in attempt', { userId, email })
			throw new InvalidCredentialsError()
		}

		// Update last sign in timestamp
		await this.db
			.from('users')
			.update({
				last_sign_in_at: new Date().toISOString(),
			})
			.eq('id', userId)
			.exec()

		// Create session
		const session = await this.sessionManager.createSession(userId, {
			ipAddress,
			userAgent,
		})

		// Map database row to User type
		const user = this.mapRowToUser(userRow)

		this.logger.info('User signed in', { userId, email })

		return { user, session }
	}

	// ====================================================================
	// SIGN OUT
	// ====================================================================

	/**
	 * Sign out by revoking the session
	 */
	async signOut(token: string): Promise<void> {
		try {
			await this.sessionManager.revokeSessionByToken(token, 'User signed out')
			this.logger.info('User signed out')
		} catch (err) {
			this.logger.error('Failed to sign out', { error: err })
			throw new Error('Failed to sign out')
		}
	}

	// ====================================================================
	// PASSWORD MANAGEMENT
	// ====================================================================

	/**
	 * Change password for a user (requires old password)
	 */
	async changePassword(
		userId: UserId,
		oldPassword: string,
		newPassword: string,
	): Promise<void> {
		// Validate new password strength
		if (newPassword.length < 8) {
			throw new WeakPasswordError('Password must be at least 8 characters long')
		}

		// Get current password credential
		const credentialRow = await this.db
			.from('credentials_password')
			.select('password_hash')
			.eq('user_id', userId)
			.maybeSingle()

		if (!credentialRow) {
			throw new Error('No password credential found')
		}

		// Verify old password
		const isValid = await verifyPassword(oldPassword, credentialRow.password_hash as string)

		if (!isValid) {
			throw new InvalidCredentialsError()
		}

		// Hash new password
		const newPasswordHash = await hashPassword(newPassword)

		// Update password
		await this.db
			.from('credentials_password')
			.update({
				password_hash: newPasswordHash,
				changed_at: new Date().toISOString(),
			})
			.eq('user_id', userId)
			.exec()

		// Revoke all other sessions (except current)
		// Note: Current session needs to be passed separately if you want to keep it
		await this.sessionManager.revokeAllSessions(userId)

		this.logger.info('User changed password', { userId })
	}

	/**
	 * Set password for a user (admin/reset flow, no old password required)
	 */
	async setPassword(userId: UserId, newPassword: string): Promise<void> {
		// Validate new password strength
		if (newPassword.length < 8) {
			throw new WeakPasswordError('Password must be at least 8 characters long')
		}

		// Hash new password
		const newPasswordHash = await hashPassword(newPassword)

		// Check if credential exists
		const credentialRow = await this.db
			.from('credentials_password')
			.select('id')
			.eq('user_id', userId)
			.maybeSingle()

		if (credentialRow) {
			// Update existing credential
			await this.db
				.from('credentials_password')
				.update({
					password_hash: newPasswordHash,
					changed_at: new Date().toISOString(),
				})
				.eq('user_id', userId)
				.exec()
		} else {
			// Create new credential
			await this.db
				.from('credentials_password')
				.insert({
					id: crypto.randomUUID(),
					user_id: userId,
					password_hash: newPasswordHash,
					changed_at: new Date().toISOString(),
					created_at: new Date().toISOString(),
				})
				.exec()
		}

		// Revoke all sessions
		await this.sessionManager.revokeAllSessions(userId)

		this.logger.info('User password set', { userId })
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Map database row to User type
	 */
	private mapRowToUser(row: any): User {
		return {
			id: row.id as UserId,
			email: row.email,
			phone: row.phone,
			name: row.name,
			avatarUrl: row.avatar_url,
			status: row.status,
			emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at) : null,
			phoneVerifiedAt: row.phone_verified_at ? new Date(row.phone_verified_at) : null,
			metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
			lastSignInAt: row.last_sign_in_at ? new Date(row.last_sign_in_at) : null,
			deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
		}
	}
}
