import { action, t, triggers } from 'bunbase'

export const listOrganizations = action(
	{
		name: 'list-organizations',
		description: 'List all organizations',
		input: t.Object({
			type: t.Optional(t.Union([t.Literal('Cloud'), t.Literal('On-Premise')])),
		}),
		output: t.Object({
			organizations: t.Array(
				t.Object({
					id: t.String(),
					name: t.String(),
					email: t.String(),
					type: t.String(),
					employees: t.Optional(t.Number()),
					license_status: t.Optional(t.String()),
					admin_count: t.Number(),
					created_at: t.String(),
				}),
			),
		}),
		triggers: [triggers.api('GET', '/')],
	},
	async ({ input, ctx }) => {
		let query = ctx.db.from('organizations')

		if (input.type) {
			query = query.eq('type', input.type)
		}

		const organizations = await query.orderBy('created_at', 'DESC').exec()

		// Get admin counts and latest license status for each org
		const orgsWithDetails = await Promise.all(
			organizations.map(async (org) => {
				const adminCount = await ctx.db
					.from('organization_admins')
					.eq('organization_id', org.id)
					.count()

				const latestLicense = await ctx.db
					.from('licenses')
					.eq('organization_id', org.id)
					.orderBy('created_at', 'DESC')
					.limit(1)
					.maybeSingle()

				return {
					id: org.id,
					name: org.name,
					email: org.email,
					type: org.type,
					employees: org.employees || undefined,
					license_status: latestLicense?.status,
					admin_count: adminCount,
					created_at: org.created_at,
				}
			}),
		)

		return { organizations: orgsWithDetails }
	},
)
