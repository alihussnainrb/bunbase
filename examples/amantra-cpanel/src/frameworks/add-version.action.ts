import { action, t, triggers } from 'bunbase'

export const addVersion = action(
	{
		name: 'add-framework-version',
		description: 'Add a new version to a framework',
		input: t.Object({
			frameworkId: t.String(),
			version: t.String({ minLength: 1 }),
			is_active: t.Optional(t.Boolean()),
		}),
		output: t.Object({
			id: t.String(),
			framework_id: t.String(),
			version: t.String(),
			is_active: t.Boolean(),
			created_at: t.String(),
		}),
		triggers: [triggers.api('POST', '/:frameworkId/versions')],
	},
	async ({ input, ctx }) => {
		// Check if framework exists
		const framework = await ctx.db
			.from('frameworks')
			.eq('id', input.frameworkId)
			.single()

		if (!framework) {
			throw new Error('Framework not found')
		}

		// Check if version already exists
		const existingVersion = await ctx.db
			.from('framework_versions')
			.eq('framework_id', input.frameworkId)
			.eq('version', input.version)
			.maybeSingle()

		if (existingVersion) {
			throw new Error(
				`Version ${input.version} already exists for this framework`,
			)
		}

		const version = await ctx.db
			.insert('framework_versions', {
				framework_id: input.frameworkId,
				version: input.version,
				is_active: input.is_active ?? true,
			})
			.returning('id', 'framework_id', 'version', 'is_active', 'created_at')
			.single()

		ctx.logger.info('Framework version added', {
			frameworkId: input.frameworkId,
			versionId: version.id,
			version: input.version,
		})

		return {
			id: version.id,
			framework_id: version.framework_id,
			version: version.version,
			is_active: version.is_active || false,
			created_at: version.created_at,
		}
	},
)
