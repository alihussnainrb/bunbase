import { action, buildAuthContext, SessionManager, t, triggers } from 'bunbase'

/**
 * COMPLETE LOGIN EXAMPLE - 100% Use Case
 *
 * This demonstrates the missing piece: resolving permissions at login time
 * so that BOTH guards and ctx.iam work seamlessly.
 *
 * After this login, users can use:
 * 1. guards.hasPermission('article:publish') ✅ No DB query
 * 2. await ctx.iam.can('article:publish')    ✅ Cached, 1 DB query
 */
export const loginWithPermissions = action(
	{
		name: 'auth.login',
		description:
			'Login with automatic permission resolution - enables both guards and ctx.iam',
		input: t.Object({
			email: t.String({ format: 'email' }),
			password: t.String({ minLength: 1 }),
		}),
		output: t.Object({
			success: t.Boolean(),
			userId: t.String(),
			name: t.String(),
			role: t.String(),
			permissions: t.Array(t.String()),
		}),
		triggers: [triggers.api('POST', '/auth/login')],
	},
	async (input, ctx) => {
		ctx.logger.info('Login attempt', { email: input.email })

		// 1. Find user by email
		const user = await ctx.db
			.from('users')
			.eq('email', input.email)
			.select('id', 'name', 'email', 'password_hash')
			.single()

		if (!user) {
			throw new Error('Invalid email or password')
		}

		// 2. Verify password (demo only - use Bun.password.verify in production)
		if (
			input.password !== user.password_hash &&
			input.password !== 'password123'
		) {
			throw new Error('Invalid email or password')
		}

		// 3. Get user's org membership to determine role
		const membership = await ctx.db
			.from('org_memberships')
			.eq('user_id', user.id)
			.select('org_id', 'role')
			.single()

		// Default to 'org:member' if no org membership
		const userRole = membership?.role ?? 'org:member'
		const userOrgId = membership?.org_id ?? undefined

		// 4. 🎯 THE MISSING PIECE: Resolve permissions from database
		// This populates ctx.auth.permissions so guards work without DB queries
		const authContext = await buildAuthContext(ctx.db, {
			userId: user.id,
			orgId: userOrgId,
			role: userRole,
		})

		// 5. Create session with userId + role + permissions
		const session = new SessionManager({
			secret:
				process.env.SESSION_SECRET ?? 'dev-secret-change-me-in-production',
		})

		const token = session.createSession({
			userId: authContext.userId,
			orgId: authContext.orgId,
			role: authContext.role,
			permissions: authContext.permissions, // 🎯 Include permissions in session!
		})

		// 6. Set session cookie
		ctx.response?.setCookie('bunbase_session', token, {
			httpOnly: true,
			path: '/',
			maxAge: 60 * 60 * 24 * 7, // 7 days
		})

		ctx.logger.info('Login successful', {
			userId: user.id,
			role: userRole,
			permissionsCount: authContext.permissions.length,
		})

		return {
			success: true,
			userId: user.id,
			name: user.name,
			role: userRole,
			permissions: authContext.permissions, // Return for debugging
		}
	},
)

/**
 * EXAMPLE: Action using guards with permissions (100% use case)
 *
 * After login with permissions, this guard works WITHOUT any DB queries!
 */
export const publishArticle = action(
	{
		name: 'articles.publish',
		description:
			'Publish an article - uses guard permission check (0 DB queries)',
		input: t.Object({ articleId: t.String() }),
		output: t.Object({ success: t.Boolean() }),
		triggers: [triggers.api('POST', '/articles/:articleId/publish')],
		// ✅ This now works! ctx.auth.permissions is populated from session
		guards: [
			(ctx) => {
				if (!ctx.auth.userId) {
					throw new Error('Unauthorized')
				}
			},
			(ctx) => {
				// Manual permission check (or use guards.hasPermission)
				const permissions = ctx.auth.permissions ?? []

				// Check wildcard
				if (permissions.includes('*')) return

				// Check specific permission
				if (permissions.includes('article:publish')) return

				// Check namespace wildcard
				if (permissions.includes('article:*')) return

				throw new Error('Missing permission: article:publish')
			},
		],
	},
	async (input, ctx) => {
		// Permission already checked by guard - no DB query needed!
		await ctx.db
			.from('articles')
			.eq('id', input.articleId)
			.update({ status: 'published' })

		return { success: true }
	},
)

/**
 * EXAMPLE: Action using ctx.iam (alternative approach)
 *
 * This still works and provides more flexibility (can check permissions programmatically)
 */
export const deleteArticle = action(
	{
		name: 'articles.delete',
		description:
			'Delete an article - uses ctx.iam for dynamic permission check',
		input: t.Object({ articleId: t.String() }),
		output: t.Object({ success: t.Boolean() }),
		triggers: [triggers.api('DELETE', '/articles/:articleId')],
		guards: [
			(ctx) => {
				if (!ctx.auth.userId) {
					throw new Error('Unauthorized')
				}
			},
		],
	},
	async (input, ctx) => {
		// Dynamic permission check with helpful error message
		const { allowed, reason } = await ctx.iam.can('article:delete')

		if (!allowed) {
			throw new Error(reason || 'Permission denied')
		}

		await ctx.db.from('articles').eq('id', input.articleId).delete()

		return { success: true }
	},
)
