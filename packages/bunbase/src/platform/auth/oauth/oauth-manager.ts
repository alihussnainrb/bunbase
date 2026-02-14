/**
 * OAuth Manager
 * Main OAuth manager coordinating all OAuth operations
 */

import type { DatabaseClient } from '../../../db/client.ts'
import type { Logger } from '../../../logger/index.ts'
import type { SessionDBManager } from '../session-db.ts'
import type { UserId } from '../../core/types.ts'
import type {
	OAuthProvider,
	OAuthProviderConfig,
	OAuthStartOptions,
	OAuthCallbackData,
	OAuthCallbackResult,
	OAuthAccount,
} from './types.ts'

import { ArcticProviderWrapper } from './arctic-provider.ts'
import { OAuthStateManager } from './state-manager.ts'
import { OAuthAccountLinker } from './account-linker.ts'
import { InvalidTokenError, PlatformError } from '../../core/errors.ts'

// ====================================================================
// OAUTH MANAGER
// ====================================================================

/**
 * Main OAuth manager
 * Coordinates OAuth flows: start, callback, link, unlink
 */
export class OAuthManager {
	private arcticProvider: ArcticProviderWrapper
	private stateManager: OAuthStateManager
	private accountLinker: OAuthAccountLinker

	constructor(
		private readonly db: DatabaseClient,
		private readonly sessionManager: SessionDBManager,
		private readonly logger: Logger,
		providerConfigs: Map<OAuthProvider, OAuthProviderConfig>,
	) {
		// Initialize components
		this.arcticProvider = new ArcticProviderWrapper(providerConfigs, logger)
		this.stateManager = new OAuthStateManager(db, logger)
		this.accountLinker = new OAuthAccountLinker(db, sessionManager, logger)
	}

	// ====================================================================
	// START OAUTH FLOW
	// ====================================================================

	/**
	 * Start OAuth authorization flow
	 * Returns authorization URL for redirect
	 */
	async startOAuthFlow(
		provider: OAuthProvider,
		options: OAuthStartOptions = {},
	): Promise<{
		url: string
		state: string
	}> {
		try {
			// Create authorization URL with PKCE
			const { url, state, codeVerifier, codeChallenge, nonce } =
				await this.arcticProvider.createAuthorizationURL(provider, options)

			// Get redirect URI from config
			const config = this.arcticProvider.getProvider(provider)
			const redirectUri = config.redirectURI || config.redirectUri

			// Store OAuth state for CSRF protection
			await this.stateManager.createState({
				state,
				codeVerifier,
				codeChallenge,
				codeChallengeMethod: 'S256',
				nonce,
				provider,
				redirectUri,
				returnTo: options.returnTo,
				expiresInSeconds: 600, // 10 minutes
			})

			this.logger.info('OAuth flow started', {
				provider,
				state: state.substring(0, 8) + '...',
			})

			return {
				url,
				state,
			}
		} catch (err) {
			this.logger.error('Failed to start OAuth flow', {
				error: err,
				provider,
			})
			throw new PlatformError(`Failed to start OAuth flow for ${provider}`)
		}
	}

	// ====================================================================
	// HANDLE OAUTH CALLBACK
	// ====================================================================

	/**
	 * Handle OAuth callback
	 * Validates state, exchanges code for tokens, creates/links account
	 */
	async handleOAuthCallback(
		provider: OAuthProvider,
		callbackData: OAuthCallbackData,
		metadata?: {
			ipAddress?: string
			userAgent?: string
		},
	): Promise<
		OAuthCallbackResult & {
			session: {
				token: string
				sessionId: string
			}
			returnTo: string | null
		}
	> {
		const { code, state } = callbackData

		try {
			// Verify and consume OAuth state (CSRF protection)
			const oauthState = await this.stateManager.verifyAndConsumeState(state)

			// Verify provider matches
			if (oauthState.provider !== provider) {
				throw new InvalidTokenError('Provider mismatch in OAuth callback')
			}

			// Exchange authorization code for tokens
			const tokens = await this.arcticProvider.validateCallback(
				provider,
				code,
				oauthState.codeVerifier,
			)

			// Fetch user profile from provider
			const profile = await this.arcticProvider.fetchUserProfile(
				provider,
				tokens.accessToken,
			)

			// Handle callback: create user, link account
			const result = await this.accountLinker.handleCallback(
				provider,
				tokens,
				profile,
				metadata,
			)

			// Create session
			const session = await this.sessionManager.createSession(
				result.userId,
				metadata,
			)

			this.logger.info('OAuth callback handled successfully', {
				provider,
				userId: result.userId,
				isNewUser: result.isNewUser,
			})

			return {
				...result,
				session,
				returnTo: oauthState.returnTo,
			}
		} catch (err) {
			this.logger.error('Failed to handle OAuth callback', {
				error: err,
				provider,
			})

			if (err instanceof InvalidTokenError) {
				throw err
			}

			throw new PlatformError(`Failed to handle OAuth callback for ${provider}`)
		}
	}

	// ====================================================================
	// LINK OAUTH ACCOUNT
	// ====================================================================

	/**
	 * Link OAuth account to existing authenticated user
	 */
	async linkOAuthAccount(
		userId: UserId,
		provider: OAuthProvider,
		callbackData: OAuthCallbackData,
	): Promise<OAuthAccount> {
		const { code, state } = callbackData

		try {
			// Verify and consume OAuth state
			const oauthState = await this.stateManager.verifyAndConsumeState(state)

			// Verify provider matches
			if (oauthState.provider !== provider) {
				throw new InvalidTokenError('Provider mismatch in OAuth link')
			}

			// Exchange code for tokens
			const tokens = await this.arcticProvider.validateCallback(
				provider,
				code,
				oauthState.codeVerifier,
			)

			// Fetch profile
			const profile = await this.arcticProvider.fetchUserProfile(
				provider,
				tokens.accessToken,
			)

			// Calculate token expiration
			const expiresAt = tokens.expiresIn
				? new Date(Date.now() + tokens.expiresIn * 1000)
				: null

			// Link account to user
			const account = await this.accountLinker.linkAccount({
				userId,
				provider,
				providerAccountId: profile.id,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				tokenType: tokens.tokenType,
				expiresAt,
				scope: tokens.scope,
				idToken: tokens.idToken,
				profile,
			})

			this.logger.info('OAuth account linked to user', {
				provider,
				userId,
			})

			return account
		} catch (err) {
			this.logger.error('Failed to link OAuth account', {
				error: err,
				provider,
				userId,
			})

			if (
				err instanceof InvalidTokenError ||
				err instanceof PlatformError
			) {
				throw err
			}

			throw new PlatformError(`Failed to link OAuth account for ${provider}`)
		}
	}

	// ====================================================================
	// UNLINK OAUTH ACCOUNT
	// ====================================================================

	/**
	 * Unlink OAuth account from user
	 */
	async unlinkOAuthAccount(
		userId: UserId,
		provider: OAuthProvider,
	): Promise<void> {
		await this.accountLinker.unlinkAccount(userId, provider)

		this.logger.info('OAuth account unlinked', {
			provider,
			userId,
		})
	}

	// ====================================================================
	// LIST OAUTH ACCOUNTS
	// ====================================================================

	/**
	 * List all OAuth accounts for a user
	 */
	async listOAuthAccounts(userId: UserId): Promise<OAuthAccount[]> {
		return this.accountLinker.listAccountsForUser(userId)
	}

	/**
	 * Get OAuth account for user and provider
	 */
	async getOAuthAccount(
		userId: UserId,
		provider: OAuthProvider,
	): Promise<OAuthAccount | null> {
		return this.accountLinker.findAccountByUser(userId, provider)
	}

	// ====================================================================
	// REFRESH TOKEN
	// ====================================================================

	/**
	 * Refresh OAuth access token
	 */
	async refreshOAuthToken(
		userId: UserId,
		provider: OAuthProvider,
	): Promise<void> {
		const account = await this.accountLinker.findAccountByUser(userId, provider)

		if (!account) {
			throw new PlatformError('OAuth account not found', 404)
		}

		if (!account.refreshToken) {
			throw new PlatformError('No refresh token available', 400)
		}

		try {
			// Refresh token
			const tokens = await this.arcticProvider.refreshAccessToken(
				provider,
				account.refreshToken,
			)

			// Calculate expiration
			const expiresAt = tokens.expiresIn
				? new Date(Date.now() + tokens.expiresIn * 1000)
				: null

			// Update account
			await this.accountLinker.updateAccount(account.id, {
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken || account.refreshToken,
				tokenType: tokens.tokenType,
				expiresAt,
				scope: tokens.scope,
			})

			this.logger.info('OAuth token refreshed', {
				provider,
				userId,
			})
		} catch (err) {
			this.logger.error('Failed to refresh OAuth token', {
				error: err,
				provider,
				userId,
			})
			throw new PlatformError(`Failed to refresh OAuth token for ${provider}`)
		}
	}

	// ====================================================================
	// CLEANUP
	// ====================================================================

	/**
	 * Clean up expired OAuth states
	 * Should be called periodically (e.g., via cron)
	 */
	async cleanupExpiredStates(): Promise<number> {
		return this.stateManager.cleanupExpiredStates()
	}

	// ====================================================================
	// PROVIDER CHECKS
	// ====================================================================

	/**
	 * Check if OAuth provider is configured
	 */
	isProviderConfigured(provider: OAuthProvider): boolean {
		return this.arcticProvider.isProviderConfigured(provider)
	}
}
