import { action, t, triggers } from 'bunbase'

export const deleteFramework = action(
	{
		name: 'delete-framework',
		description: 'Delete a framework (requires password confirmation)',
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
		// For now, we'll just check if password is provided
		if (!input.password || input.password.length < 8) {
			throw new Error('Invalid password')
		}

		// Check if framework exists
		const framework = await ctx.db.from('frameworks').eq('id', input.id).single()

		if (!framework) {
			throw new Error('Framework not found')
		}

		// Delete framework (CASCADE will delete versions)
		await ctx.db.from('frameworks').eq('id', input.id).delete()

		ctx.logger.info('Framework deleted', { frameworkId: input.id, frameworkName: framework.name })

		return {
			success: true,
			message: `Framework "${framework.name}" deleted successfully`,
		}
	},
)
