import { action, t, triggers } from 'bunbase'

export const getLicense = action(
	{
		name: 'get-license',
		description: 'Get license details',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			license_key: t.String(),
			organization_id: t.String(),
			organization_name: t.String(),
			status: t.String(),
			operational_users_limit: t.Number(),
			frameworks_limit: t.Number(),
			duration_days: t.Number(),
			valid_from: t.String(),
			valid_until: t.String(),
			license_file_path: t.Optional(t.String()),
			modules: t.Array(
				t.Object({
					id: t.String(),
					name: t.String(),
				}),
			),
			created_at: t.String(),
		}),
		triggers: [triggers.api('GET', '/:id')],
	},
	async (input, ctx) => {
		const license = await ctx.db.from('licenses').eq('id', input.id).single()

		if (!license) {
			throw new Error('License not found')
		}

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
			organization_id: license.organization_id,
			organization_name: organization?.name || 'Unknown',
			status: license.status,
			operational_users_limit: license.operational_users_limit,
			frameworks_limit: license.frameworks_limit,
			duration_days: license.duration_days,
			valid_from: license.valid_from,
			valid_until: license.valid_until,
			license_file_path: license.license_file_path || undefined,
			modules: modules.map((m) => ({
				id: m.id,
				name: m.name,
			})),
			created_at: license.created_at,
		}
	},
)
