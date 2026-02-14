import { action, t, triggers, BadRequest, NotFound } from 'bunbase'

export const updateOrganization = action(
	{
		name: 'update-organization',
		description: 'Update organization details',
		input: t.Object({
			id: t.String(),
			name: t.Optional(t.String({ minLength: 1 })),
			email: t.Optional(t.String({ format: 'email' })),
			phone: t.Optional(t.String()),
			employees: t.Optional(t.Number()),
			address: t.Optional(t.String()),
			type: t.Optional(t.Union([t.Literal('Cloud'), t.Literal('On-Premise')])),
		}),
		output: t.Object({
			id: t.String(),
			name: t.String(),
			email: t.String(),
			type: t.String(),
			updated_at: t.String(),
		}),
		triggers: [triggers.api('PATCH', '/:id')],
	},
	async (input, ctx) => {
		const updates: Record<string, any> = {}

		if (input.name) updates.name = input.name
		if (input.email) updates.email = input.email
		if (input.phone !== undefined) updates.phone = input.phone
		if (input.employees !== undefined) updates.employees = input.employees
		if (input.address !== undefined) updates.address = input.address
		if (input.type) updates.type = input.type

		if (Object.keys(updates).length === 0) {
			throw new BadRequest('No fields to update')
		}

		updates.updated_at = new Date().toISOString()

		const organization = await ctx.db
			.update('organizations')
			.eq('id', input.id)
			.set(updates)
			.returning('id', 'name', 'email', 'type', 'updated_at')
			.single()

		if (!organization) {
			throw new NotFound('Organization not found')
		}

		ctx.logger.info('Organization updated', { organizationId: organization.id })

		return {
			id: organization.id,
			name: organization.name,
			email: organization.email,
			type: organization.type,
			updated_at: organization.updated_at,
		}
	},
)
