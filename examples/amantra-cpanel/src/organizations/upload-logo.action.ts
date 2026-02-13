import { action, t, triggers } from 'bunbase'

export const uploadLogo = action(
	{
		name: 'upload-organization-logo',
		description: 'Upload organization logo',
		input: t.Object({
			id: t.String(),
			filename: t.String(),
			content: t.String(), // Base64 encoded image
			contentType: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			logo_path: t.String(),
		}),
		triggers: [triggers.api('POST', '/:id/logo')],
	},
	async ({ input, ctx }) => {
		// Verify organization exists
		const organization = await ctx.db.from('organizations').eq('id', input.id).single()

		if (!organization) {
			throw new Error('Organization not found')
		}

		// Convert base64 to buffer
		const buffer = Buffer.from(input.content, 'base64')

		// Upload to storage
		const path = `organizations/${input.id}/logo-${Date.now()}-${input.filename}`
		await ctx.storage.put(path, buffer, {
			contentType: input.contentType,
		})

		// Update organization with logo path
		const updated = await ctx.db
			.update('organizations')
			.eq('id', input.id)
			.set({ logo_path: path })
			.returning('id', 'logo_path')
			.single()

		if (!updated) {
			throw new Error('Failed to update organization logo')
		}

		ctx.logger.info('Organization logo uploaded', { organizationId: input.id, path })

		return {
			id: updated.id,
			logo_path: updated.logo_path || '',
		}
	},
)
