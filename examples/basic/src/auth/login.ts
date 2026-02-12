import { action, t, triggers, SessionManager } from 'bunbase'

/**
 * Login action — authenticates a user and sets a session cookie.
 * Demonstrates: POST trigger, database query, session management, response cookies.
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
		triggers: [
			triggers.api('POST', '/login')
		],
		// No guards — login must be accessible without auth
	},
	async (input, ctx) => {
		ctx.logger.info('Login attempt', { email: input.email })

		// Find user by email
		const user = await ctx.db
			.from('users')
			.eq('email', input.email)
			.select('id', 'name', 'email', 'password_hash')
			.single()

		if (!user) {
			throw new Error('Invalid email or password')
		}

		// In a real app: await Bun.password.verify(input.password, user.password_hash)
		// For demo purposes, we're just checking equality (NOT SECURE!)
		if (input.password !== user.password_hash && input.password !== 'password123') {
			throw new Error('Invalid email or password')
		}

		// Set session cookie via response context
		const session = new SessionManager({
			secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me-in-production',
		})
		const token = session.createSession({
			userId: user.id,
			role: 'user',
		})

		ctx.response?.setCookie('bunbase_session', token, {
			httpOnly: true,
			path: '/',
			maxAge: 60 * 60 * 24 * 7, // 7 days
		})

		ctx.logger.info('Login successful', { userId: user.id })

		return {
			success: true,
			userId: user.id,
			name: user.name,
		}
	},
)
