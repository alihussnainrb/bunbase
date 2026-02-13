import { action, t, triggers } from 'bunbase'

export const deleteOrganization = action(
	{
		name: 'delete-organization',
		description: 'Delete an organization and all related data',
		input: t.Object({
			id: t.String(),
			password: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
			message: t.String(),
		}),
		triggers: [triggers.api('DELETE', '/:id')],
	},
	async ({ input, ctx }) => {
		// TODO: Implement password verification against super admin user
		if (!input.password || input.password.length < 8) {
			throw new Error('Invalid password')
		}

		const organization = await ctx.db
			.from('organizations')
			.eq('id', input.id)
			.single()

		if (!organization) {
			throw new Error('Organization not found')
		}

		// Delete organization (CASCADE will delete admins, licenses, notifications)
		await ctx.db.from('organizations').eq('id', input.id).delete()

		ctx.logger.info('Organization deleted', {
			organizationId: input.id,
			organizationName: organization.name,
		})

		return {
			success: true,
			message: `Organization "${organization.name}" deleted successfully`,
		}
	},
)
