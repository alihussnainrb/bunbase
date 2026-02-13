import { compare } from 'bcrypt'
import { action, http, t, triggers } from 'bunbase'

/**
 * Advanced login example with HTTP field mapping
 *
 * Demonstrates the new http.* API for mapping fields to/from:
 * - Request headers, query params, cookies
 * - Response headers and cookies
 */
export const advancedLogin = action(
	{
		name: 'advanced-login',
		description: 'Login with HTTP field mappings',
		input: t.Object({
			// Body fields (default - no wrapper needed)
			email: t.String({ format: 'email' }),
			password: t.String({ minLength: 8 }),

			// Read from HTTP header (explicit name)
			apiKey: t.Optional(http.Header(t.String(), 'X-API-Key')),

			// Read from query parameter (auto-match field name)
			remember: t.Optional(http.Query(t.Boolean())),

			// Read from cookie
			deviceId: t.Optional(http.Cookie(t.String())),
		}),
		output: t.Object({
			// Body fields (default - no wrapper needed)
			user: t.Object({
				id: t.String(),
				email: t.String(),
				name: t.String(),
			}),
			accessToken: t.String(),

			// Write to HTTP-only secure cookie
			refreshToken: http.Cookie(t.String(), 'refresh_token', {
				httpOnly: true,
				secure: true,
				sameSite: 'strict',
				maxAge: 7 * 24 * 60 * 60, // 7 days
				path: '/',
			}),

			// Write to response headers
			userId: http.Header(t.String(), 'X-User-ID'),
			expiresAt: http.Header(t.String(), 'X-Session-Expires'),
		}),
		triggers: [triggers.api('POST', '/auth/advanced-login')],
	},
	async ({ input, ctx }) => {
		// Validate API key if provided
		if (input.apiKey && input.apiKey !== process.env.API_KEY) {
			throw new Error('Invalid API key')
		}

		// Find user
		const user = await ctx.db.from('users').eq('email', input.email).single()
		if (!user) {
			throw new Error('Invalid credentials')
		}

		// Verify password
		const valid = await compare(input.password, user.password_hash)
		if (!valid) {
			throw new Error('Invalid credentials')
		}

		// Generate tokens
		const accessToken = `access_${user.id}_${Date.now()}`
		const refreshToken = `refresh_${user.id}_${Date.now()}`

		// Calculate expiry
		const expiryMs = input.remember
			? 7 * 24 * 60 * 60 * 1000
			: 24 * 60 * 60 * 1000
		const expiresAt = new Date(Date.now() + expiryMs).toISOString()

		ctx.logger.info('Advanced login successful', {
			userId: user.id,
			remember: input.remember,
			hasApiKey: !!input.apiKey,
			deviceId: input.deviceId,
		})

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
			accessToken,
			refreshToken, // → Set-Cookie: refresh_token=...; HttpOnly; Secure
			userId: user.id, // → X-User-ID: ...
			expiresAt, // → X-Session-Expires: ...
		}
	},
)
