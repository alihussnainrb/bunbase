import { action, t, triggers } from 'bunbase'
import { Type } from 'typebox'

/**
 * Simple login action — authenticates a user and sets a session cookie automatically.
 * Demonstrates: POST trigger, ctx.auth.loginWithEmail() which handles credential
 * verification and session cookie creation in one call.
 */
export const login = action(
	{
		name: 'login',
		description: 'Authenticate with email and password, receive session cookie',
		input: t.Object({
			email: t.String({ format: 'email' }),
			password: t.String({ minLength: 1 }),
		}),
		output: t.Object({
			success: t.Boolean(),
			userId: t.String(),
			name: t.String(),
		}),
		triggers: [triggers.api('POST', '/login')],
		// No guards — login must be accessible without auth
	},
	async (input, ctx) => {
		ctx.logger.info('Login attempt', { email: input.email })

		// Verifies credentials, creates session, auto-sets cookie
		const user = await ctx.auth.loginWithEmail({
			email: input.email,
			password: input.password,
		})

		ctx.logger.info('Login successful', { userId: user.id })

		Type

		return {
			success: true,
			userId: user.id,
			name: user.email,
		}
	},
)
