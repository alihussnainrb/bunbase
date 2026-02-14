/**
 * OAuth Types
 * Types for OAuth integration with Arctic library
 */

import type { UserId } from '../../core/types.ts'

// ====================================================================
// OAUTH PROVIDERS
// ====================================================================

/**
 * Supported OAuth providers
 */
export type OAuthProvider = 'google' | 'github' | 'microsoft' | 'apple'

/**
 * OAuth provider configuration
 */
export interface OAuthProviderConfig {
	clientId: string
	clientSecret: string
	redirectUri: string
	scopes?: string[]
}

// ====================================================================
// OAUTH STATE
// ====================================================================

/**
 * OAuth state for CSRF protection and PKCE
 * Stored temporarily during OAuth flow
 */
export interface OAuthState {
	id: string
	state: string
	codeVerifier: string
	codeChallenge: string
	codeChallengeMethod: 'S256' | 'plain'
	nonce: string | null
	provider: OAuthProvider
	redirectUri: string
	returnTo: string | null
	expiresAt: Date
	createdAt: Date
}

/**
 * OAuth state creation data
 */
export interface CreateOAuthStateData {
	state: string
	codeVerifier: string
	codeChallenge: string
	codeChallengeMethod?: 'S256' | 'plain'
	nonce?: string
	provider: OAuthProvider
	redirectUri: string
	returnTo?: string
	expiresInSeconds?: number
}

// ====================================================================
// OAUTH ACCOUNT
// ====================================================================

/**
 * OAuth account linking a user to a provider
 */
export interface OAuthAccount {
	id: string
	userId: UserId
	provider: OAuthProvider
	providerAccountId: string
	accessToken: string | null
	refreshToken: string | null
	tokenType: string | null
	expiresAt: Date | null
	scope: string | null
	idToken: string | null
	profile: OAuthProfile
	createdAt: Date
	updatedAt: Date
}

/**
 * OAuth profile data from provider
 */
export interface OAuthProfile {
	id: string
	email?: string
	name?: string
	picture?: string
	emailVerified?: boolean
	[key: string]: unknown
}

/**
 * OAuth account creation data
 */
export interface CreateOAuthAccountData {
	userId: UserId
	provider: OAuthProvider
	providerAccountId: string
	accessToken?: string
	refreshToken?: string
	tokenType?: string
	expiresAt?: Date
	scope?: string
	idToken?: string
	profile: OAuthProfile
}

/**
 * OAuth account update data
 */
export interface UpdateOAuthAccountData {
	accessToken?: string
	refreshToken?: string
	tokenType?: string
	expiresAt?: Date
	scope?: string
	idToken?: string
	profile?: OAuthProfile
}

// ====================================================================
// OAUTH TOKENS
// ====================================================================

/**
 * OAuth tokens returned from provider
 */
export interface OAuthTokens {
	accessToken: string
	refreshToken?: string
	tokenType?: string
	expiresIn?: number
	scope?: string
	idToken?: string
}

// ====================================================================
// OAUTH FLOW
// ====================================================================

/**
 * OAuth authorization URL data
 */
export interface OAuthAuthorizationUrl {
	url: string
	state: string
	codeVerifier: string
	codeChallenge: string
}

/**
 * OAuth callback data
 */
export interface OAuthCallbackData {
	code: string
	state: string
}

/**
 * OAuth callback result
 */
export interface OAuthCallbackResult {
	userId: UserId
	isNewUser: boolean
	oauthAccount: OAuthAccount
}

// ====================================================================
// OAUTH START OPTIONS
// ====================================================================

/**
 * Options for starting OAuth flow
 */
export interface OAuthStartOptions {
	returnTo?: string
	scopes?: string[]
	prompt?: 'none' | 'consent' | 'select_account'
	loginHint?: string
}

// ====================================================================
// OAUTH LINK OPTIONS
// ====================================================================

/**
 * Options for linking OAuth account to existing user
 */
export interface OAuthLinkOptions {
	userId: UserId
	code: string
	state: string
}
