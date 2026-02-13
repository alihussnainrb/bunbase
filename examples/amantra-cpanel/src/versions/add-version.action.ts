import { action, t, triggers } from 'bunbase'

export const addVersion = action(
	{
		name: 'add-product-version',
		description: 'Add a new AMANTRA product version',
		input: t.Object({
			version_name: t.String({ minLength: 1 }),
			backend_version: t.Optional(t.String()),
			frontend_version: t.Optional(t.String()),
			ai_services_version: t.Optional(t.String()),
			release_type: t.Optional(t.Union([t.Literal('Beta'), t.Literal('Stable'), t.Literal('Patch')])),
			release_date: t.String(),
			notes: t.Optional(t.String()),
		}),
		output: t.Object({
			id: t.String(),
			version_name: t.String(),
			release_type: t.String(),
			release_date: t.String(),
			created_at: t.String(),
		}),
		triggers: [triggers.api('POST', '/')],
	},
	async ({ input, ctx }) => {
		const version = await ctx.db
			.insert('product_versions', {
				version_name: input.version_name,
				backend_version: input.backend_version,
				frontend_version: input.frontend_version,
				ai_services_version: input.ai_services_version,
				release_type: input.release_type || 'Stable',
				release_date: input.release_date,
				notes: input.notes,
			})
			.returning('id', 'version_name', 'release_type', 'release_date', 'created_at')
			.single()

		ctx.logger.info('Product version added', { versionId: version.id, versionName: input.version_name })

		return {
			id: version.id,
			version_name: version.version_name,
			release_type: version.release_type,
			release_date: version.release_date,
			created_at: version.created_at,
		}
	},
)
