import { action, guards, t, triggers, Unauthorized, NotFound } from 'bunbase'

export const me = action(
	{
		name: 'super-admin-me',
		description: 'Get current super admin user',
		input: t.Object({}),
		output: t.Object({
			id: t.String(),
			email: t.String(),
			name: t.String(),
		}),
		triggers: [triggers.api('GET', '/me')],
		guards: [guards.authenticated()],
	},
	async (input, ctx) => {
		const userId = ctx.auth.userId

		if (!userId) {
			throw new Unauthorized('Not authenticated')
		}

		const user = await ctx.db.from('users').eq('id', userId).single()

		if (!user) {
			throw new NotFound('User not found')
		}

		return {
			id: user.id,
			email: user.email,
			name: user.name,
		}
	},
)
