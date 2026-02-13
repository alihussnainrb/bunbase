import { action, t, triggers } from 'bunbase'

export const createFramework = action(
	{
		name: 'create-framework',
		description: 'Create a new compliance framework',
		input: t.Object({
			name: t.String({ minLength: 1 }),
			type: t.Optional(t.Union([t.Literal('Standard'), t.Literal('Custom')])),
			status: t.Optional(t.Union([t.Literal('Active'), t.Literal('Archived')])),
		}),
		output: t.Object({
			id: t.String(),
			name: t.String(),
			type: t.String(),
			status: t.String(),
			created_at: t.String(),
		}),
		triggers: [triggers.api('POST', '/')],
	},
	async ({ input, ctx }) => {
		const framework = await ctx.db
			.insert('frameworks', {
				name: input.name,
				type: input.type || 'Standard',
				status: input.status || 'Active',
			})
			.returning('id', 'name', 'type', 'status', 'created_at')
			.single()

		ctx.logger.info('Framework created', { frameworkId: framework.id })

		return {
			id: framework.id,
			name: framework.name,
			type: framework.type,
			status: framework.status,
			created_at: framework.created_at,
		}
	},
)
