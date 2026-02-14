/**
 * Google OAuth Provider
 * Provider-specific configuration and helpers for Google OAuth
 */

import type { OAuthProviderConfig } from '../types.ts'

/**
 * Default Google OAuth scopes
 */
export const GOOGLE_DEFAULT_SCOPES = ['openid', 'profile', 'email']

/**
 * Create Google OAuth configuration
 */
export function createGoogleConfig(config: {
	clientId: string
	clientSecret: string
	redirectUri: string
	scopes?: string[]
}): OAuthProviderConfig {
	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		redirectUri: config.redirectUri,
		scopes: config.scopes || GOOGLE_DEFAULT_SCOPES,
	}
}

/**
 * Google OAuth endpoints
 */
export const GOOGLE_ENDPOINTS = {
	authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
	token: 'https://oauth2.googleapis.com/token',
	userInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
	revoke: 'https://oauth2.googleapis.com/revoke',
} as const
