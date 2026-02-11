import { action, t, triggers, guards } from 'bunbase'
import { findUserById } from '../lib/store.ts'

/**
 * Me action — returns the current authenticated user's profile.
 * Demonstrates: authenticated guard, reading auth context.
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
		const user = findUserById(ctx.auth.userId!)
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
