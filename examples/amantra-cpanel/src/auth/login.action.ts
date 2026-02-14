import { action, t, triggers, BadRequest, verifyPassword } from 'bunbase'

export const login = action(
	{
		name: 'super-admin-login',
		description: 'Super admin login',
		input: t.Object({
			email: t.String({ format: 'email' }),
			password: t.String({ minLength: 8 }),
		}),
		output: t.Object({
			user: t.Object({
				id: t.String(),
				email: t.String(),
				name: t.String(),
			}),
			session_token: t.String(),
		}),
		triggers: [triggers.api('POST', '/login')],
	},
	async (input, ctx) => {
		// Get user by email
		const user = await ctx.db
			.from('users')
			.eq('email', input.email)
			.maybeSingle()

		if (!user) {
			throw new BadRequest('Invalid credentials')
		}

		// Verify password using Bun's Argon2id hashing
		const isValid = await verifyPassword(input.password, user.password_hash)

		if (!isValid) {
			throw new BadRequest('Invalid credentials')
		}

		// Create session
		const sessionToken = await ctx.auth.createSession({
			userId: user.id,
			email: user.email,
			name: user.name,
		})

		ctx.logger.info('Super admin logged in', { userId: user.id })

		return {
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
			session_token: sessionToken,
		}
	},
)
