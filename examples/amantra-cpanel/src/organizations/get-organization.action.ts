import { action, t, triggers, NotFound } from 'bunbase'

export const getOrganization = action(
	{
		name: 'get-organization',
		description: 'Get organization details with admins and licenses',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			name: t.String(),
			email: t.String(),
			phone: t.Optional(t.String()),
			employees: t.Optional(t.Number()),
			address: t.Optional(t.String()),
			type: t.String(),
			logo_path: t.Optional(t.String()),
			created_at: t.String(),
			admins: t.Array(
				t.Object({
					id: t.String(),
					name: t.String(),
					email: t.String(),
					invited_at: t.Optional(t.String()),
				}),
			),
			licenses: t.Array(
				t.Object({
					id: t.String(),
					license_key: t.String(),
					status: t.String(),
					valid_from: t.String(),
					valid_until: t.String(),
					operational_users_limit: t.Number(),
					frameworks_limit: t.Number(),
				}),
			),
		}),
		triggers: [triggers.api('GET', '/:id')],
	},
	async (input, ctx) => {
		const organization = await ctx.db
			.from('organizations')
			.eq('id', input.id)
			.single()

		if (!organization) {
			throw new NotFound('Organization not found')
		}

		const admins = await ctx.db
			.from('organization_admins')
			.eq('organization_id', input.id)
			.orderBy('created_at', 'ASC')
			.exec()

		const licenses = await ctx.db
			.from('licenses')
			.eq('organization_id', input.id)
			.orderBy('created_at', 'DESC')
			.exec()

		return {
			id: organization.id,
			name: organization.name,
			email: organization.email,
			phone: organization.phone || undefined,
			employees: organization.employees || undefined,
			address: organization.address || undefined,
			type: organization.type,
			logo_path: organization.logo_path || undefined,
			created_at: organization.created_at,
			admins: admins.map((a) => ({
				id: a.id,
				name: a.name,
				email: a.email,
				invited_at: a.invited_at || undefined,
			})),
			licenses: licenses.map((l) => ({
				id: l.id,
				license_key: l.license_key,
				status: l.status,
				valid_from: l.valid_from,
				valid_until: l.valid_until,
				operational_users_limit: l.operational_users_limit,
				frameworks_limit: l.frameworks_limit,
			})),
		}
	},
)
