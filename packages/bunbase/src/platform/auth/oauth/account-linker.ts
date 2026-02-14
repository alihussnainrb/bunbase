/**
 * OAuth Account Linker
 * Links OAuth accounts to users, handles signup and signin flows
 */

import type { DatabaseClient } from '../../../db/client.ts'
import type { Logger } from '../../../logger/index.ts'
import type { SessionDBManager } from '../session-db.ts'
import type { UserId, User } from '../../core/types.ts'
import type {
	OAuthProvider,
	OAuthAccount,
	OAuthProfile,
	OAuthTokens,
	CreateOAuthAccountData,
	UpdateOAuthAccountData,
	OAuthCallbackResult,
} from './types.ts'
import {
	UserNotFoundError,
	EmailAlreadyExistsError,
	PlatformError,
} from '../../core/errors.ts'
import { newUserId } from '../../core/ids.ts'

// ====================================================================
// OAUTH ACCOUNT LINKER
// ====================================================================

/**
 * Manages OAuth account linking and user creation
 */
export class OAuthAccountLinker {
	constructor(
		private readonly db: DatabaseClient,
		private readonly sessionManager: SessionDBManager,
		private readonly logger: Logger,
	) {}

	// ====================================================================
	// CALLBACK HANDLER
	// ====================================================================

	/**
	 * Handle OAuth callback - signin or signup
	 * Creates user if doesn't exist, links account, creates session
	 */
	async handleCallback(
		provider: OAuthProvider,
		tokens: OAuthTokens,
		profile: OAuthProfile,
		metadata?: {
			ipAddress?: string
			userAgent?: string
		},
	): Promise<OAuthCallbackResult> {
		const { accessToken, refreshToken, tokenType, expiresIn, scope, idToken } =
			tokens

		// Calculate token expiration
		const expiresAt = expiresIn
			? new Date(Date.now() + expiresIn * 1000)
			: null

		// Check if account already exists
		const existingAccount = await this.findAccountByProvider(
			provider,
			profile.id,
		)

		if (existingAccount) {
			// Update existing account with new tokens
			await this.updateAccount(existingAccount.id, {
				accessToken,
				refreshToken,
				tokenType,
				expiresAt: expiresAt ?? undefined,
				scope,
				idToken,
				profile,
			})

			this.logger.info('OAuth account updated', {
				provider,
				userId: existingAccount.userId,
			})

			return {
				userId: existingAccount.userId,
				isNewUser: false,
				oauthAccount: {
					...existingAccount,
					accessToken,
					refreshToken: refreshToken ?? null,
					tokenType: tokenType ?? null,
					expiresAt: expiresAt ?? null,
					scope: scope ?? null,
					idToken: idToken ?? null,
					profile,
				},
			}
		}

		// Check if user exists with this email
		const email = profile.email
		let userId: UserId | null = null
		let isNewUser = false

		if (email) {
			const existingUser = await this.db
				.from('users')
				.select('id')
				.eq('email', email.toLowerCase())
				.maybeSingle()

			if (existingUser) {
				userId = existingUser.id as UserId
			}
		}

		// Create new user if doesn't exist
		if (!userId) {
			userId = await this.createUserFromOAuth(profile)
			isNewUser = true

			this.logger.info('New user created from OAuth', {
				provider,
				userId,
				email,
			})
		}

		// Link OAuth account
		const oauthAccount = await this.linkAccount({
			userId,
			provider,
			providerAccountId: profile.id,
			accessToken,
			refreshToken: refreshToken ?? undefined,
			tokenType: tokenType ?? undefined,
			expiresAt: expiresAt ?? undefined,
			scope: scope ?? undefined,
			idToken: idToken ?? undefined,
			profile,
		})

		this.logger.info('OAuth account linked', {
			provider,
			userId,
			isNewUser,
		})

		return {
			userId,
			isNewUser,
			oauthAccount,
		}
	}

	// ====================================================================
	// CREATE USER FROM OAUTH
	// ====================================================================

	/**
	 * Create new user from OAuth profile
	 */
	private async createUserFromOAuth(profile: OAuthProfile): Promise<UserId> {
		const userId = newUserId()
		const email = profile.email?.toLowerCase() || null
		const name = profile.name || null

		try {
			await this.db
				.from('users')
				.insert({
					id: userId,
					email,
					name,
					status: 'active',
					email_verified_at: profile.emailVerified
						? new Date().toISOString()
						: null,
					metadata: {
						oauth_signup: true,
						avatar: profile.picture,
					},
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})

			return userId
		} catch (err) {
			this.logger.error('Failed to create user from OAuth', {
				error: err,
				profile,
			})
			throw new Error('Failed to create user from OAuth')
		}
	}

	// ====================================================================
	// LINK ACCOUNT
	// ====================================================================

	/**
	 * Link OAuth account to existing user
	 */
	async linkAccount(data: CreateOAuthAccountData): Promise<OAuthAccount> {
		const {
			userId,
			provider,
			providerAccountId,
			accessToken,
			refreshToken,
			tokenType,
			expiresAt,
			scope,
			idToken,
			profile,
		} = data

		// Verify user exists
		const user = await this.db
			.from('users')
			.select('id')
			.eq('id', userId)
			.maybeSingle()

		if (!user) {
			throw new UserNotFoundError(userId)
		}

		// Check if account already linked
		const existing = await this.findAccountByProvider(provider, providerAccountId)
		if (existing && existing.userId !== userId) {
			throw new PlatformError(
				'OAuth account already linked to another user',
				409,
			)
		}

		const id = crypto.randomUUID()

		try {
			const [row] = await this.db
				.from('oauth_accounts')
				.returning(['*'])
				.insert({
					id,
					user_id: userId,
					provider,
					provider_account_id: providerAccountId,
					access_token: accessToken || null,
					refresh_token: refreshToken || null,
					token_type: tokenType || null,
					expires_at: expiresAt?.toISOString() || null,
					scope: scope || null,
					id_token: idToken || null,
					profile: profile,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})

			this.logger.info('OAuth account linked to user', {
				userId,
				provider,
				accountId: id,
			})

			return this.mapRowToAccount(row)
		} catch (err) {
			this.logger.error('Failed to link OAuth account', {
				error: err,
				userId,
				provider,
			})
			throw new Error('Failed to link OAuth account')
		}
	}

	// ====================================================================
	// UNLINK ACCOUNT
	// ====================================================================

	/**
	 * Unlink OAuth account from user
	 */
	async unlinkAccount(
		userId: UserId,
		provider: OAuthProvider,
	): Promise<void> {
		// Check if user has password credential or other OAuth accounts
		const [passwordCred, otherAccounts] = await Promise.all([
			this.db
				.from('credentials_password')
				.select('id')
				.eq('user_id', userId)
				.maybeSingle(),
			this.db
				.from('oauth_accounts')
				.select('*')
				.eq('user_id', userId)
				.neq('provider', provider)
				.exec(),
		])

		// Prevent unlinking if this is the only auth method
		if (!passwordCred && otherAccounts.length === 0) {
			throw new PlatformError(
				'Cannot unlink the only authentication method',
				400,
			)
		}

		try {
			await this.db
				.from('oauth_accounts')
				.eq('user_id', userId)
				.eq('provider', provider)
				.delete()

			this.logger.info('OAuth account unlinked', { userId, provider })
		} catch (err) {
			this.logger.error('Failed to unlink OAuth account', {
				error: err,
				userId,
				provider,
			})
			throw new Error('Failed to unlink OAuth account')
		}
	}

	// ====================================================================
	// FIND ACCOUNT
	// ====================================================================

	/**
	 * Find OAuth account by provider and provider account ID
	 */
	async findAccountByProvider(
		provider: OAuthProvider,
		providerAccountId: string,
	): Promise<OAuthAccount | null> {
		const row = await this.db
			.from('oauth_accounts')
			.select('*')
			.eq('provider', provider)
			.eq('provider_account_id', providerAccountId)
			.maybeSingle()

		return row ? this.mapRowToAccount(row) : null
	}

	/**
	 * Find OAuth account by user and provider
	 */
	async findAccountByUser(
		userId: UserId,
		provider: OAuthProvider,
	): Promise<OAuthAccount | null> {
		const row = await this.db
			.from('oauth_accounts')
			.select('*')
			.eq('user_id', userId)
			.eq('provider', provider)
			.maybeSingle()

		return row ? this.mapRowToAccount(row) : null
	}

	/**
	 * List all OAuth accounts for a user
	 */
	async listAccountsForUser(userId: UserId): Promise<OAuthAccount[]> {
		const rows = await this.db
			.from('oauth_accounts')
			.eq('user_id', userId)
			.orderBy('created_at', 'DESC')
			.select('*')
			.exec()

		return rows.map((row) => this.mapRowToAccount(row))
	}

	// ====================================================================
	// UPDATE ACCOUNT
	// ====================================================================

	/**
	 * Update OAuth account
	 */
	async updateAccount(
		accountId: string,
		data: UpdateOAuthAccountData,
	): Promise<void> {
		const updateData: Record<string, any> = {
			updated_at: new Date().toISOString(),
		}

		if (data.accessToken !== undefined)
			updateData.access_token = data.accessToken
		if (data.refreshToken !== undefined)
			updateData.refresh_token = data.refreshToken
		if (data.tokenType !== undefined) updateData.token_type = data.tokenType
		if (data.expiresAt !== undefined)
			updateData.expires_at = data.expiresAt?.toISOString() || null
		if (data.scope !== undefined) updateData.scope = data.scope
		if (data.idToken !== undefined) updateData.id_token = data.idToken
		if (data.profile !== undefined) updateData.profile = data.profile

		try {
			await this.db
				.from('oauth_accounts')
				.eq('id', accountId)
				.update(updateData)

			this.logger.debug('OAuth account updated', { accountId })
		} catch (err) {
			this.logger.error('Failed to update OAuth account', {
				error: err,
				accountId,
			})
			throw new Error('Failed to update OAuth account')
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Map database row to OAuthAccount
	 */
	private mapRowToAccount(row: any): OAuthAccount {
		return {
			id: row.id,
			userId: row.user_id as UserId,
			provider: row.provider as OAuthProvider,
			providerAccountId: row.provider_account_id,
			accessToken: row.access_token,
			refreshToken: row.refresh_token,
			tokenType: row.token_type,
			expiresAt: row.expires_at ? new Date(row.expires_at) : null,
			scope: row.scope,
			idToken: row.id_token,
			profile: row.profile as OAuthProfile,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
		}
	}
}
