import { action, t, triggers } from 'bunbase'

export const updateVersion = action(
	{
		name: 'update-product-version',
		description: 'Update product version details',
		input: t.Object({
			id: t.String(),
			backend_version: t.Optional(t.String()),
			frontend_version: t.Optional(t.String()),
			ai_services_version: t.Optional(t.String()),
			release_type: t.Optional(
				t.Union([t.Literal('Beta'), t.Literal('Stable'), t.Literal('Patch')]),
			),
			notes: t.Optional(t.String()),
		}),
		output: t.Object({
			id: t.String(),
			version_name: t.String(),
			release_type: t.String(),
		}),
		triggers: [triggers.api('PATCH', '/:id')],
	},
	async (input, ctx) => {
		const updates: Record<string, any> = {}

		if (input.backend_version !== undefined)
			updates.backend_version = input.backend_version
		if (input.frontend_version !== undefined)
			updates.frontend_version = input.frontend_version
		if (input.ai_services_version !== undefined)
			updates.ai_services_version = input.ai_services_version
		if (input.release_type) updates.release_type = input.release_type
		if (input.notes !== undefined) updates.notes = input.notes

		if (Object.keys(updates).length === 0) {
			throw new Error('No fields to update')
		}

		const version = await ctx.db
			.update('product_versions')
			.eq('id', input.id)
			.set(updates)
			.returning('id', 'version_name', 'release_type')
			.single()

		if (!version) {
			throw new Error('Product version not found')
		}

		ctx.logger.info('Product version updated', { versionId: version.id })

		return {
			id: version.id,
			version_name: version.version_name,
			release_type: version.release_type,
		}
	},
)
