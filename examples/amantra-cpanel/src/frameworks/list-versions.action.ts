import { action, t, triggers } from 'bunbase'

export const listVersions = action(
	{
		name: 'list-framework-versions',
		description: 'List all versions of a framework',
		input: t.Object({
			frameworkId: t.String(),
		}),
		output: t.Object({
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
		triggers: [triggers.api('GET', '/:frameworkId/versions')],
	},
	async (input, ctx) => {
		const versions = await ctx.db
			.from('framework_versions')
			.eq('framework_id', input.frameworkId)
			.orderBy('created_at', 'DESC')
			.exec()

		return {
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
