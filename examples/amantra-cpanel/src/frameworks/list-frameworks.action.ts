import { action, t, triggers } from 'bunbase'

export const listFrameworks = action(
	{
		name: 'list-frameworks',
		description: 'List all compliance frameworks',
		input: t.Object({
			status: t.Optional(t.Union([t.Literal('Active'), t.Literal('Archived')])),
			type: t.Optional(t.Union([t.Literal('Standard'), t.Literal('Custom')])),
		}),
		output: t.Object({
			frameworks: t.Array(
				t.Object({
					id: t.String(),
					name: t.String(),
					type: t.String(),
					status: t.String(),
					version_count: t.Number(),
					created_at: t.String(),
				}),
			),
		}),
		triggers: [triggers.api('GET', '/')],
	},
	async ({ input, ctx }) => {
		let query = ctx.db.from('frameworks')

		if (input.status) {
			query = query.eq('status', input.status)
		}

		if (input.type) {
			query = query.eq('type', input.type)
		}

		const frameworks = await query.orderBy('created_at', 'DESC').exec()

		// Get version counts for each framework
		const frameworksWithCounts = await Promise.all(
			frameworks.map(async (framework) => {
				const versionCount = await ctx.db
					.from('framework_versions')
					.eq('framework_id', framework.id)
					.count()

				return {
					id: framework.id,
					name: framework.name,
					type: framework.type,
					status: framework.status,
					version_count: versionCount,
					created_at: framework.created_at,
				}
			}),
		)

		return { frameworks: frameworksWithCounts }
	},
)
