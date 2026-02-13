import { action, t, triggers } from 'bunbase'

export const getVersion = action(
	{
		name: 'get-product-version',
		description: 'Get product version details',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			version_name: t.String(),
			backend_version: t.Optional(t.String()),
			frontend_version: t.Optional(t.String()),
			ai_services_version: t.Optional(t.String()),
			release_type: t.String(),
			release_date: t.String(),
			notes: t.Optional(t.String()),
			created_at: t.String(),
		}),
		triggers: [triggers.api('GET', '/:id')],
	},
	async ({ input, ctx }) => {
		const version = await ctx.db.from('product_versions').eq('id', input.id).single()

		if (!version) {
			throw new Error('Product version not found')
		}

		return {
			id: version.id,
			version_name: version.version_name,
			backend_version: version.backend_version || undefined,
			frontend_version: version.frontend_version || undefined,
			ai_services_version: version.ai_services_version || undefined,
			release_type: version.release_type,
			release_date: version.release_date,
			notes: version.notes || undefined,
			created_at: version.created_at,
		}
	},
)
