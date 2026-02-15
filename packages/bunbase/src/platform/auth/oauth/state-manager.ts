/**
 * OAuth State Manager
 * Manages OAuth state for CSRF protection, PKCE, and nonce
 */

import type { DatabaseClient } from '../../../db/client.ts'
import type { Logger } from '../../../logger/index.ts'
import type { OAuthState, CreateOAuthStateData, OAuthProvider } from './types.ts'
import { InvalidTokenError } from '../../core/errors.ts'

// ====================================================================
// OAUTH STATE MANAGER
// ====================================================================

/**
 * Manages OAuth state storage for secure OAuth flows
 * Handles CSRF tokens, PKCE, and nonce generation
 */
export class OAuthStateManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly logger: Logger,
	) {}

	// ====================================================================
	// CREATE STATE
	// ====================================================================

	/**
	 * Create and store OAuth state
	 */
	async createState(data: CreateOAuthStateData): Promise<OAuthState> {
		const {
			state,
			codeVerifier,
			codeChallenge,
			codeChallengeMethod = 'S256',
			nonce = null,
			provider,
			redirectUri,
			returnTo = null,
			expiresInSeconds = 600, // 10 minutes default
		} = data

		const id = crypto.randomUUID()
		const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

		try {
			const row = await this.db
				.from('oauth_states')
				.returning(['*'])
				.insert({
					id,
					state,
					code_verifier: codeVerifier,
					code_challenge: codeChallenge,
					code_challenge_method: codeChallengeMethod,
					nonce,
					provider,
					redirect_uri: redirectUri,
					return_to: returnTo,
					expires_at: expiresAt.toISOString(),
					created_at: new Date().toISOString(),
				})

			this.logger.debug('OAuth state created', {
				stateId: id,
				provider,
				expiresAt,
			})

			return this.mapRowToState(row)
		} catch (err) {
			this.logger.error('Failed to create OAuth state', { error: err, provider })
			throw new Error('Failed to create OAuth state')
		}
	}

	// ====================================================================
	// GET STATE
	// ====================================================================

	/**
	 * Get OAuth state by state token
	 * @throws {InvalidTokenError} If state not found or expired
	 */
	async getState(state: string): Promise<OAuthState> {
		const row = await this.db
			.from('oauth_states')
			.select('*')
			.eq('state', state)
			.maybeSingle()

		if (!row) {
			throw new InvalidTokenError('Invalid or expired OAuth state')
		}

		const oauthState = this.mapRowToState(row)

		// Check expiration
		if (oauthState.expiresAt < new Date()) {
			// Clean up expired state
			await this.deleteState(state)
			throw new InvalidTokenError('OAuth state has expired')
		}

		return oauthState
	}

	// ====================================================================
	// DELETE STATE
	// ====================================================================

	/**
	 * Delete OAuth state (after successful callback or expiration)
	 */
	async deleteState(state: string): Promise<void> {
		try {
			await this.db.from('oauth_states').eq('state', state).delete()

			this.logger.debug('OAuth state deleted', { state: state.substring(0, 8) + '...' })
		} catch (err) {
			this.logger.error('Failed to delete OAuth state', { error: err })
		}
	}

	// ====================================================================
	// VERIFY STATE
	// ====================================================================

	/**
	 * Verify and consume OAuth state
	 * Returns state data and deletes it (one-time use)
	 * @throws {InvalidTokenError} If state not found or expired
	 */
	async verifyAndConsumeState(state: string): Promise<OAuthState> {
		const oauthState = await this.getState(state)

		// Delete state (one-time use)
		await this.deleteState(state)

		return oauthState
	}

	// ====================================================================
	// CLEANUP
	// ====================================================================

	/**
	 * Clean up expired OAuth states
	 * Should be called periodically (e.g., via cron)
	 */
	async cleanupExpiredStates(): Promise<number> {
		try {
			const result = await this.db
				.from('oauth_states')
				.lt('expires_at', new Date().toISOString())
				.delete()

			const count = Array.isArray(result) ? result.length : 0
			this.logger.debug(`Cleaned up ${count} expired OAuth states`)

			return count
		} catch (err) {
			this.logger.error('Failed to cleanup expired OAuth states', { error: err })
			return 0
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Map database row to OAuthState
	 */
	private mapRowToState(row: any): OAuthState {
		return {
			id: row.id,
			state: row.state,
			codeVerifier: row.code_verifier,
			codeChallenge: row.code_challenge,
			codeChallengeMethod: row.code_challenge_method,
			nonce: row.nonce,
			provider: row.provider as OAuthProvider,
			redirectUri: row.redirect_uri,
			returnTo: row.return_to,
			expiresAt: new Date(row.expires_at),
			createdAt: new Date(row.created_at),
		}
	}
}

// ====================================================================
// CRYPTO UTILITIES
// ====================================================================

/**
 * Generate random OAuth state (for CSRF protection)
 */
export function generateState(): string {
	const array = new Uint8Array(32)
	crypto.getRandomValues(array)
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate PKCE code verifier
 */
export function generateCodeVerifier(): string {
	const array = new Uint8Array(32)
	crypto.getRandomValues(array)
	return base64UrlEncode(array)
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(
	verifier: string,
): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(verifier)
	const hash = await crypto.subtle.digest('SHA-256', data)
	return base64UrlEncode(new Uint8Array(hash))
}

/**
 * Generate OIDC nonce
 */
export function generateNonce(): string {
	const array = new Uint8Array(16)
	crypto.getRandomValues(array)
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Base64 URL encode (RFC 4648)
 */
function base64UrlEncode(buffer: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...buffer))
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
