/**
 * Microsoft OAuth Provider
 * Provider-specific configuration and helpers for Microsoft OAuth
 */

import type { OAuthProviderConfig } from '../types.ts'

/**
 * Default Microsoft OAuth scopes
 */
export const MICROSOFT_DEFAULT_SCOPES = ['openid', 'profile', 'email']

/**
 * Create Microsoft OAuth configuration
 */
export function createMicrosoftConfig(config: {
	clientId: string
	clientSecret: string
	redirectUri: string
	tenant?: string // Default: 'common'
	scopes?: string[]
}): OAuthProviderConfig {
	const tenant = config.tenant || 'common'

	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		redirectUri: config.redirectUri,
		scopes: config.scopes || MICROSOFT_DEFAULT_SCOPES,
	}
}

/**
 * Microsoft OAuth endpoints
 */
export const MICROSOFT_ENDPOINTS = {
	authorization: (tenant = 'common') =>
		`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
	token: (tenant = 'common') =>
		`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
	userInfo: 'https://graph.microsoft.com/v1.0/me',
	userPhoto: 'https://graph.microsoft.com/v1.0/me/photo/$value',
} as const

/**
 * Available Microsoft OAuth scopes
 */
export const MICROSOFT_SCOPES = {
	OPENID: 'openid',
	PROFILE: 'profile',
	EMAIL: 'email',
	OFFLINE_ACCESS: 'offline_access',
	USER_READ: 'User.Read',
	USER_READ_ALL: 'User.ReadBasic.All',
	MAIL_READ: 'Mail.Read',
	CALENDARS_READ: 'Calendars.Read',
	FILES_READ: 'Files.Read',
} as const
