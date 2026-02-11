import { action, t, triggers, guards } from 'bunbase'

/**
 * Me action — returns the current authenticated user's profile.
 * Demonstrates: authenticated guard, reading auth context, database query.
 */
export const me = action(
	{
		name: 'me',
		description: 'Get the currently authenticated user profile',
		input: t.Object({}),
		output: t.Object({
			id: t.String(),
			email: t.String(),
			name: t.String(),
		}),
		triggers: [triggers.api('GET', '/me')],
		guards: [guards.authenticated()],
	},
	async (_input, ctx) => {
		// Query user from database
		const user = await ctx.db
			.from('users')
			.eq('id', ctx.auth.userId!)
			.select('id', 'email', 'name')
			.single()

		if (!user) {
			throw new Error('User not found')
		}

		return {
			id: user.id,
			email: user.email,
			name: user.name,
		}
	},
)
