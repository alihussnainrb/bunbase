import { action, guards, t, triggers } from 'bunbase'

/**
 * LOGIN EXAMPLE — Uses ctx.auth.loginWithEmail() which handles
 * credential verification, session creation, and cookie setting in one call.
 */
export const loginWithPermissions = action(
	{
		name: 'auth.login',
		description: 'Login with email and password — automatic session + cookie',
		input: t.Object({
			email: t.String({ format: 'email' }),
			password: t.String({ minLength: 1 }),
		}),
		output: t.Object({
			success: t.Boolean(),
			userId: t.String(),
			name: t.String(),
		}),
		triggers: [triggers.api('POST', '/auth/login')],
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

		return ctx.withMeta({
			success: true,
			userId: user.id,
			name: user.name as string,
		})
	},
)

/**
 * EXAMPLE: Action protected by built-in guards.
 * guards.authenticated() checks ctx.auth.userId exists.
 * guards.hasPermission() checks ctx.auth.permissions from the session — zero DB queries.
 */
export const publishArticle = action(
	{
		name: 'articles.publish',
		description:
			'Publish an article — uses guard permission check (0 DB queries)',
		input: t.Object({ articleId: t.String() }),
		output: t.Object({ success: t.Boolean() }),
		triggers: [triggers.api('POST', '/articles/:articleId/publish')],
		guards: [guards.authenticated(), guards.hasPermission('article:publish')],
	},
	async (input, ctx) => {
		await ctx.db
			.from('articles')
			.eq('id', input.articleId)
			.update({ status: 'published' })

		return { success: true }
	},
)

/**
 * EXAMPLE: Action using ctx.auth.can() for dynamic permission checks.
 * Unlike guards, can() queries the database (with 5-min cache) for role-based permissions.
 */
export const deleteArticle = action(
	{
		name: 'articles.delete',
		description: 'Delete an article — uses ctx.auth.can() for dynamic check',
		input: t.Object({ articleId: t.String() }),
		output: t.Object({ success: t.Boolean() }),
		triggers: [triggers.api('DELETE', '/articles/:articleId')],
		guards: [guards.authenticated()],
	},
	async (input, ctx) => {
		const { allowed, reason } = await ctx.auth.can('article:delete')

		if (!allowed) {
			throw new Error(reason || 'Permission denied')
		}

		await ctx.db.from('articles').eq('id', input.articleId).delete()

		return { success: true }
	},
)
