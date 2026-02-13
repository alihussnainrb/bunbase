import { action, t, triggers } from 'bunbase'

export const updateFramework = action(
	{
		name: 'update-framework',
		description: 'Update framework details',
		input: t.Object({
			id: t.String(),
			name: t.Optional(t.String({ minLength: 1 })),
			type: t.Optional(t.Union([t.Literal('Standard'), t.Literal('Custom')])),
			status: t.Optional(t.Union([t.Literal('Active'), t.Literal('Archived')])),
		}),
		output: t.Object({
			id: t.String(),
			name: t.String(),
			type: t.String(),
			status: t.String(),
			updated_at: t.String(),
		}),
		triggers: [triggers.api('PATCH', '/:id')],
	},
	async ({ input, ctx }) => {
		const updates: Record<string, any> = {}

		if (input.name) updates.name = input.name
		if (input.type) updates.type = input.type
		if (input.status) updates.status = input.status

		if (Object.keys(updates).length === 0) {
			throw new Error('No fields to update')
		}

		updates.updated_at = new Date().toISOString()

		const framework = await ctx.db
			.update('frameworks')
			.eq('id', input.id)
			.set(updates)
			.returning('id', 'name', 'type', 'status', 'updated_at')
			.single()

		if (!framework) {
			throw new Error('Framework not found')
		}

		ctx.logger.info('Framework updated', { frameworkId: framework.id })

		return {
			id: framework.id,
			name: framework.name,
			type: framework.type,
			status: framework.status,
			updated_at: framework.updated_at,
		}
	},
)
