import { action, t, triggers } from 'bunbase'

export const listVersions = action(
	{
		name: 'list-product-versions',
		description: 'List all AMANTRA product versions',
		input: t.Object({
			release_type: t.Optional(
				t.Union([t.Literal('Beta'), t.Literal('Stable'), t.Literal('Patch')]),
			),
		}),
		output: t.Object({
			versions: t.Array(
				t.Object({
					id: t.String(),
					version_name: t.String(),
					backend_version: t.Optional(t.String()),
					frontend_version: t.Optional(t.String()),
					ai_services_version: t.Optional(t.String()),
					release_type: t.String(),
					release_date: t.String(),
					created_at: t.String(),
				}),
			),
		}),
		triggers: [triggers.api('GET', '/')],
	},
	async ({ input, ctx }) => {
		let query = ctx.db.from('product_versions')

		if (input.release_type) {
			query = query.eq('release_type', input.release_type)
		}

		const versions = await query.orderBy('release_date', 'DESC').exec()

		return {
			versions: versions.map((v) => ({
				id: v.id,
				version_name: v.version_name,
				backend_version: v.backend_version || undefined,
				frontend_version: v.frontend_version || undefined,
				ai_services_version: v.ai_services_version || undefined,
				release_type: v.release_type,
				release_date: v.release_date,
				created_at: v.created_at,
			})),
		}
	},
)
