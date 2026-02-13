import { action, t, triggers } from 'bunbase'

export const listLicenses = action(
	{
		name: 'list-licenses',
		description: 'List all licenses',
		input: t.Object({
			organization_id: t.Optional(t.String()),
			status: t.Optional(t.Union([t.Literal('Active'), t.Literal('Inactive'), t.Literal('Revoked'), t.Literal('Expired')])),
		}),
		output: t.Object({
			licenses: t.Array(
				t.Object({
					id: t.String(),
					license_key: t.String(),
					organization_name: t.String(),
					status: t.String(),
					valid_from: t.String(),
					valid_until: t.String(),
					operational_users_limit: t.Number(),
					frameworks_limit: t.Number(),
					modules: t.Array(t.String()),
					created_at: t.String(),
				}),
			),
		}),
		triggers: [triggers.api('GET', '/')],
	},
	async ({ input, ctx }) => {
		let query = ctx.db.from('licenses')

		if (input.organization_id) {
			query = query.eq('organization_id', input.organization_id)
		}

		if (input.status) {
			query = query.eq('status', input.status)
		}

		const licenses = await query.orderBy('created_at', 'DESC').exec()

		// Get organization names and modules for each license
		const licensesWithDetails = await Promise.all(
			licenses.map(async (license) => {
				const organization = await ctx.db
					.from('organizations')
					.eq('id', license.organization_id)
					.single()

				const licenseModules = await ctx.db
					.from('license_modules')
					.eq('license_id', license.id)
					.exec()

				const moduleIds = licenseModules.map((lm) => lm.module_id)
				const modules = await ctx.db.from('modules').in('id', moduleIds).exec()

				return {
					id: license.id,
					license_key: license.license_key,
					organization_name: organization?.name || 'Unknown',
					status: license.status,
					valid_from: license.valid_from,
					valid_until: license.valid_until,
					operational_users_limit: license.operational_users_limit,
					frameworks_limit: license.frameworks_limit,
					modules: modules.map((m) => m.name),
					created_at: license.created_at,
				}
			}),
		)

		return { licenses: licensesWithDetails }
	},
)
