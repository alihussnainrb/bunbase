import { action, t, triggers, NotFound } from 'bunbase'

export const getFramework = action(
	{
		name: 'get-framework',
		description: 'Get framework details with all versions',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			name: t.String(),
			type: t.String(),
			status: t.String(),
			created_at: t.String(),
			versions: t.Array(
				t.Object({
					id: t.String(),
					version: t.String(),
					is_active: t.Boolean(),
					has_content: t.Boolean(),
					created_at: t.String(),
				}),
			),
		}),
		triggers: [triggers.api('GET', '/:id')],
	},
	async (input, ctx) => {
		const framework = await ctx.db
			.from('frameworks')
			.eq('id', input.id)
			.single()

		if (!framework) {
			throw new NotFound('Framework not found')
		}

		const versions = await ctx.db
			.from('framework_versions')
			.eq('framework_id', input.id)
			.orderBy('created_at', 'DESC')
			.exec()

		return {
			id: framework.id,
			name: framework.name,
			type: framework.type,
			status: framework.status,
			created_at: framework.created_at,
			versions: versions.map((v) => ({
				id: v.id,
				version: v.version,
				is_active: v.is_active || false,
				has_content: !!(v.content_json || v.content_file_path),
				created_at: v.created_at,
			})),
		}
	},
)
