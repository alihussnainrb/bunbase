/**
 * GitHub OAuth Provider
 * Provider-specific configuration and helpers for GitHub OAuth
 */

import type { OAuthProviderConfig } from '../types.ts'

/**
 * Default GitHub OAuth scopes
 */
export const GITHUB_DEFAULT_SCOPES = ['user:email']

/**
 * Create GitHub OAuth configuration
 */
export function createGitHubConfig(config: {
	clientId: string
	clientSecret: string
	redirectUri: string
	scopes?: string[]
}): OAuthProviderConfig {
	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		redirectUri: config.redirectUri,
		scopes: config.scopes || GITHUB_DEFAULT_SCOPES,
	}
}

/**
 * GitHub OAuth endpoints
 */
export const GITHUB_ENDPOINTS = {
	authorization: 'https://github.com/login/oauth/authorize',
	token: 'https://github.com/login/oauth/access_token',
	user: 'https://api.github.com/user',
	emails: 'https://api.github.com/user/emails',
} as const

/**
 * Available GitHub OAuth scopes
 */
export const GITHUB_SCOPES = {
	USER: 'user',
	USER_EMAIL: 'user:email',
	USER_READ: 'read:user',
	REPO: 'repo',
	PUBLIC_REPO: 'public_repo',
	GIST: 'gist',
	NOTIFICATIONS: 'notifications',
	ADMIN_ORG: 'admin:org',
} as const
