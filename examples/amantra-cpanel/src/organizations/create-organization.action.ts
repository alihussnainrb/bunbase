import { action, t, triggers } from 'bunbase'

export const createOrganization = action(
	{
		name: 'create-organization',
		description: 'Create a new organization with admin',
		input: t.Object({
			name: t.String({ minLength: 1 }),
			email: t.String({ format: 'email' }),
			phone: t.Optional(t.String()),
			employees: t.Optional(t.Number()),
			address: t.Optional(t.String()),
			type: t.Optional(t.Union([t.Literal('Cloud'), t.Literal('On-Premise')])),
			admin_name: t.String({ minLength: 1 }),
			admin_email: t.String({ format: 'email' }),
		}),
		output: t.Object({
			organization: t.Object({
				id: t.String(),
				name: t.String(),
				email: t.String(),
				type: t.String(),
				created_at: t.String(),
			}),
			admin: t.Object({
				id: t.String(),
				name: t.String(),
				email: t.String(),
			}),
		}),
		triggers: [triggers.api('POST', '/')],
	},
	async (input, ctx) => {
		// Create organization
		const organization = await ctx.db
			.insert('organizations', {
				name: input.name,
				email: input.email,
				phone: input.phone,
				employees: input.employees,
				address: input.address,
				type: input.type || 'Cloud',
			})
			.returning('id', 'name', 'email', 'type', 'created_at')
			.single()

		// Create admin user
		const admin = await ctx.db
			.insert('organization_admins', {
				organization_id: organization.id,
				name: input.admin_name,
				email: input.admin_email,
				invited_at: new Date().toISOString(),
			})
			.returning('id', 'name', 'email')
			.single()

		// Send invite email to admin
		try {
			await ctx.mailer.send({
				to: admin.email,
				subject: 'Welcome to AMANTRA',
				html: `
					<h1>Welcome to AMANTRA</h1>
					<p>Hello ${admin.name},</p>
					<p>Your organization "${organization.name}" has been created in AMANTRA Control Panel.</p>
					<p>You will receive further instructions to access your AMANTRA instance.</p>
				`,
			})

			// Log notification
			await ctx.db.insert('notifications', {
				organization_id: organization.id,
				admin_id: admin.id,
				type: 'invite',
				subject: 'Welcome to AMANTRA',
				message: `Admin invite sent to ${admin.email}`,
				status: 'sent',
			})
		} catch (error) {
			ctx.logger.error('Failed to send admin invite email', {
				error,
				adminEmail: admin.email,
			})
		}

		ctx.logger.info('Organization created', {
			organizationId: organization.id,
			adminId: admin.id,
		})

		return {
			organization: {
				id: organization.id,
				name: organization.name,
				email: organization.email,
				type: organization.type,
				created_at: organization.created_at,
			},
			admin: {
				id: admin.id,
				name: admin.name,
				email: admin.email,
			},
		}
	},
)
