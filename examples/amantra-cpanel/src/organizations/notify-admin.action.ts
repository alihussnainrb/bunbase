import { action, t, triggers } from 'bunbase'

export const notifyAdmin = action(
	{
		name: 'notify-organization-admin',
		description: 'Send notification email to organization admin',
		input: t.Object({
			id: t.String(),
			admin_id: t.Optional(t.String()),
			subject: t.String({ minLength: 1 }),
			message: t.String({ minLength: 1 }),
		}),
		output: t.Object({
			success: t.Boolean(),
			notification_id: t.String(),
		}),
		triggers: [triggers.api('POST', '/:id/notify')],
	},
	async ({ input, ctx }) => {
		// Verify organization exists
		const organization = await ctx.db.from('organizations').eq('id', input.id).single()

		if (!organization) {
			throw new Error('Organization not found')
		}

		// Get admin(s) to notify
		let admins
		if (input.admin_id) {
			const admin = await ctx.db
				.from('organization_admins')
				.eq('id', input.admin_id)
				.eq('organization_id', input.id)
				.single()

			if (!admin) {
				throw new Error('Admin not found')
			}
			admins = [admin]
		} else {
			// Notify all admins
			admins = await ctx.db.from('organization_admins').eq('organization_id', input.id).exec()

			if (admins.length === 0) {
				throw new Error('No admins found for this organization')
			}
		}

		// Send emails to all selected admins
		const notificationIds: string[] = []

		for (const admin of admins) {
			try {
				await ctx.mailer.send({
					to: admin.email,
					subject: input.subject,
					html: `
						<p>Hello ${admin.name},</p>
						${input.message}
						<hr>
						<p><small>Organization: ${organization.name}</small></p>
					`,
				})

				// Log notification
				const notification = await ctx.db
					.insert('notifications', {
						organization_id: input.id,
						admin_id: admin.id,
						type: 'manual',
						subject: input.subject,
						message: input.message,
						status: 'sent',
					})
					.returning('id')
					.single()

				notificationIds.push(notification.id)
			} catch (error) {
				ctx.logger.error('Failed to send notification', { error, adminEmail: admin.email })

				// Log failed notification
				const notification = await ctx.db
					.insert('notifications', {
						organization_id: input.id,
						admin_id: admin.id,
						type: 'manual',
						subject: input.subject,
						message: input.message,
						status: 'failed',
					})
					.returning('id')
					.single()

				notificationIds.push(notification.id)
			}
		}

		ctx.logger.info('Notifications sent', {
			organizationId: input.id,
			adminCount: admins.length,
		})

		return {
			success: true,
			notification_id: notificationIds[0] || '',
		}
	},
)
