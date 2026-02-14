/**
 * Arctic Provider Wrapper
 * Unified interface for OAuth providers using Arctic library
 */

import {
	Google,
	GitHub,
	// Microsoft, // Not available in current version of arctic
	Apple,
	generateCodeVerifier,
	generateState as arcticGenerateState,
} from 'arctic'
import type {
	OAuthProvider,
	OAuthProviderConfig,
	OAuthTokens,
	OAuthProfile,
	OAuthStartOptions,
} from './types.ts'
import type { Logger } from '../../../logger/index.ts'
import {
	generateState,
	generateCodeVerifier as localGenerateCodeVerifier,
	generateCodeChallenge,
	generateNonce,
} from './state-manager.ts'

// ====================================================================
// ARCTIC PROVIDER WRAPPER
// ====================================================================

/**
 * Wrapper around Arctic OAuth providers
 * Provides unified interface for all supported providers
 */
export class ArcticProviderWrapper {
	private providers: Map<OAuthProvider, any> = new Map()

	constructor(
		private readonly configs: Map<OAuthProvider, OAuthProviderConfig>,
		private readonly logger: Logger,
	) {
		this.initializeProviders()
	}

	// ====================================================================
	// INITIALIZATION
	// ====================================================================

	/**
	 * Initialize Arctic providers based on configuration
	 */
	private initializeProviders(): void {
		for (const [provider, config] of this.configs.entries()) {
			try {
				const arcticProvider = this.createArcticProvider(provider, config)
				this.providers.set(provider, arcticProvider)
				this.logger.info(`OAuth provider initialized: ${provider}`)
			} catch (err) {
				this.logger.error(`Failed to initialize OAuth provider: ${provider}`, {
					error: err,
				})
			}
		}
	}

	/**
	 * Create Arctic provider instance
	 */
	private createArcticProvider(
		provider: OAuthProvider,
		config: OAuthProviderConfig,
	): any {
		const { clientId, clientSecret, redirectUri } = config

		switch (provider) {
			case 'google':
				return new Google(clientId, clientSecret, redirectUri)

			case 'github':
				return new GitHub(clientId, clientSecret, redirectUri)

			case 'microsoft':
				throw new Error('Microsoft provider not currently supported by arctic library')

			case 'apple':
				// Apple requires additional configuration (team ID, key ID, private key)
				// This is a simplified version - real implementation would need proper setup
				throw new Error('Apple OAuth not yet implemented')

			default:
				throw new Error(`Unsupported OAuth provider: ${provider}`)
		}
	}

	// ====================================================================
	// GET PROVIDER
	// ====================================================================

	/**
	 * Get Arctic provider instance
	 */
	getProvider(provider: OAuthProvider): any {
		const arcticProvider = this.providers.get(provider)
		if (!arcticProvider) {
			throw new Error(`OAuth provider not configured: ${provider}`)
		}
		return arcticProvider
	}

	/**
	 * Check if provider is configured
	 */
	isProviderConfigured(provider: OAuthProvider): boolean {
		return this.providers.has(provider)
	}

	// ====================================================================
	// AUTHORIZATION URL
	// ====================================================================

	/**
	 * Create authorization URL for OAuth flow
	 */
	async createAuthorizationURL(
		provider: OAuthProvider,
		options: OAuthStartOptions = {},
	): Promise<{
		url: string
		state: string
		codeVerifier: string
		codeChallenge: string
		nonce: string | null
	}> {
		const arcticProvider = this.getProvider(provider)

		// Generate CSRF state
		const state = generateState()

		// Generate PKCE
		const codeVerifier = localGenerateCodeVerifier()
		const codeChallenge = await generateCodeChallenge(codeVerifier)

		// Generate nonce for OIDC providers (Google, Microsoft, Apple)
		const nonce = this.isOIDCProvider(provider) ? generateNonce() : null

		// Get scopes
		const scopes = options.scopes || this.getDefaultScopes(provider)

		try {
			// Create authorization URL using Arctic
			let url: URL

			if (provider === 'google') {
				url = arcticProvider.createAuthorizationURL(
					state,
					codeVerifier,
					scopes,
				)

				// Add optional parameters
				if (options.prompt) {
					url.searchParams.set('prompt', options.prompt)
				}
				if (options.loginHint) {
					url.searchParams.set('login_hint', options.loginHint)
				}
				if (nonce) {
					url.searchParams.set('nonce', nonce)
				}
			} else if (provider === 'github') {
				url = arcticProvider.createAuthorizationURL(state, scopes)
			} else if (provider === 'microsoft') {
				url = arcticProvider.createAuthorizationURL(
					state,
					codeVerifier,
					scopes,
				)
				if (nonce) {
					url.searchParams.set('nonce', nonce)
				}
			} else {
				throw new Error(`Unsupported provider: ${provider}`)
			}

			this.logger.debug('Created OAuth authorization URL', {
				provider,
				scopes,
			})

			return {
				url: url.toString(),
				state,
				codeVerifier,
				codeChallenge,
				nonce,
			}
		} catch (err) {
			this.logger.error('Failed to create authorization URL', {
				error: err,
				provider,
			})
			throw new Error(`Failed to create authorization URL for ${provider}`)
		}
	}

	// ====================================================================
	// VALIDATE CALLBACK
	// ====================================================================

	/**
	 * Validate OAuth callback and exchange code for tokens
	 */
	async validateCallback(
		provider: OAuthProvider,
		code: string,
		codeVerifier: string,
	): Promise<OAuthTokens> {
		const arcticProvider = this.getProvider(provider)

		try {
			let tokens: any

			if (provider === 'google') {
				tokens = await arcticProvider.validateAuthorizationCode(
					code,
					codeVerifier,
				)
			} else if (provider === 'github') {
				tokens = await arcticProvider.validateAuthorizationCode(code)
			} else if (provider === 'microsoft') {
				tokens = await arcticProvider.validateAuthorizationCode(
					code,
					codeVerifier,
				)
			} else {
				throw new Error(`Unsupported provider: ${provider}`)
			}

			this.logger.debug('OAuth tokens validated', { provider })

			// Convert Arctic tokens to our format
			return {
				accessToken: tokens.accessToken || tokens.access_token,
				refreshToken: tokens.refreshToken || tokens.refresh_token,
				tokenType: tokens.tokenType || tokens.token_type,
				expiresIn: tokens.expiresIn || tokens.expires_in,
				scope: tokens.scope,
				idToken: tokens.idToken || tokens.id_token,
			}
		} catch (err) {
			this.logger.error('Failed to validate OAuth callback', {
				error: err,
				provider,
			})
			throw new Error(`Failed to validate OAuth callback for ${provider}`)
		}
	}

	// ====================================================================
	// REFRESH TOKEN
	// ====================================================================

	/**
	 * Refresh OAuth access token
	 */
	async refreshAccessToken(
		provider: OAuthProvider,
		refreshToken: string,
	): Promise<OAuthTokens> {
		const arcticProvider = this.getProvider(provider)

		try {
			let tokens: any

			if (provider === 'google') {
				tokens = await arcticProvider.refreshAccessToken(refreshToken)
			} else if (provider === 'microsoft') {
				tokens = await arcticProvider.refreshAccessToken(refreshToken)
			} else {
				throw new Error(`Token refresh not supported for ${provider}`)
			}

			this.logger.debug('OAuth token refreshed', { provider })

			return {
				accessToken: tokens.accessToken || tokens.access_token,
				refreshToken: tokens.refreshToken || tokens.refresh_token,
				tokenType: tokens.tokenType || tokens.token_type,
				expiresIn: tokens.expiresIn || tokens.expires_in,
				scope: tokens.scope,
				idToken: tokens.idToken || tokens.id_token,
			}
		} catch (err) {
			this.logger.error('Failed to refresh OAuth token', {
				error: err,
				provider,
			})
			throw new Error(`Failed to refresh OAuth token for ${provider}`)
		}
	}

	// ====================================================================
	// USER INFO
	// ====================================================================

	/**
	 * Fetch user profile from provider
	 */
	async fetchUserProfile(
		provider: OAuthProvider,
		accessToken: string,
	): Promise<OAuthProfile> {
		try {
			let profile: any

			if (provider === 'google') {
				profile = await this.fetchGoogleProfile(accessToken)
			} else if (provider === 'github') {
				profile = await this.fetchGitHubProfile(accessToken)
			} else if (provider === 'microsoft') {
				profile = await this.fetchMicrosoftProfile(accessToken)
			} else {
				throw new Error(`Profile fetching not implemented for ${provider}`)
			}

			this.logger.debug('Fetched OAuth user profile', {
				provider,
				profileId: profile.id,
			})

			return profile
		} catch (err) {
			this.logger.error('Failed to fetch OAuth profile', {
				error: err,
				provider,
			})
			throw new Error(`Failed to fetch user profile from ${provider}`)
		}
	}

	/**
	 * Fetch Google user profile
	 */
	private async fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
		const response = await fetch(
			'https://www.googleapis.com/oauth2/v2/userinfo',
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		)

		if (!response.ok) {
			throw new Error('Failed to fetch Google profile')
		}

		const data = await response.json()

		return {
			id: data.id,
			email: data.email,
			name: data.name,
			picture: data.picture,
			emailVerified: data.verified_email,
		}
	}

	/**
	 * Fetch GitHub user profile
	 */
	private async fetchGitHubProfile(
		accessToken: string,
	): Promise<OAuthProfile> {
		// Fetch user info
		const userResponse = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'User-Agent': 'Bunbase',
			},
		})

		if (!userResponse.ok) {
			throw new Error('Failed to fetch GitHub profile')
		}

		const userData = await userResponse.json()

		// Fetch emails
		const emailsResponse = await fetch('https://api.github.com/user/emails', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'User-Agent': 'Bunbase',
			},
		})

		const emails = emailsResponse.ok ? await emailsResponse.json() : []
		const primaryEmail = emails.find((e: any) => e.primary)

		return {
			id: userData.id.toString(),
			email: primaryEmail?.email || userData.email,
			name: userData.name || userData.login,
			picture: userData.avatar_url,
			emailVerified: primaryEmail?.verified || false,
		}
	}

	/**
	 * Fetch Microsoft user profile
	 */
	private async fetchMicrosoftProfile(
		accessToken: string,
	): Promise<OAuthProfile> {
		const response = await fetch('https://graph.microsoft.com/v1.0/me', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		})

		if (!response.ok) {
			throw new Error('Failed to fetch Microsoft profile')
		}

		const data = await response.json()

		return {
			id: data.id,
			email: data.mail || data.userPrincipalName,
			name: data.displayName,
			picture: undefined,
			emailVerified: true, // Microsoft accounts are verified
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Check if provider uses OIDC (requires nonce)
	 */
	private isOIDCProvider(provider: OAuthProvider): boolean {
		return ['google', 'microsoft', 'apple'].includes(provider)
	}

	/**
	 * Get default scopes for provider
	 */
	private getDefaultScopes(provider: OAuthProvider): string[] {
		switch (provider) {
			case 'google':
				return ['openid', 'profile', 'email']
			case 'github':
				return ['user:email']
			case 'microsoft':
				return ['openid', 'profile', 'email']
			case 'apple':
				return ['name', 'email']
			default:
				return []
		}
	}
}
