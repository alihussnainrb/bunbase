import { action, t, triggers } from 'bunbase'

/**
 * Cron job that runs daily to check for expiring licenses
 * and send notifications to organization admins
 */
export default action(
	{
		name: 'check-license-expiry',
		description: 'Check for expiring licenses and send notifications',
		input: t.Object({}),
		output: t.Object({
			checked: t.Number(),
			expiring_soon: t.Number(),
			expired: t.Number(),
			notifications_sent: t.Number(),
		}),
		triggers: [
			triggers.cron('0 0 * * *'), // Run daily at midnight
		],
	},
	async (input, ctx) => {
		const now = new Date()
		const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

		// Get all active licenses
		const activeLicenses = await ctx.db
			.from('licenses')
			.eq('status', 'Active')
			.exec()

		let expiringSoon = 0
		let expired = 0
		let notificationsSent = 0

		for (const license of activeLicenses) {
			const validUntil = new Date(license.valid_until)

			// Check if license has expired
			if (validUntil < now) {
				// Mark as expired
				await ctx.db
					.update('licenses')
					.eq('id', license.id)
					.set({ status: 'Expired' })

				expired++

				// Send expiry notification
				try {
					const organization = await ctx.db
						.from('organizations')
						.eq('id', license.organization_id)
						.single()

					const admins = await ctx.db
						.from('organization_admins')
						.eq('organization_id', license.organization_id)
						.exec()

					for (const admin of admins) {
						await ctx.mailer.send({
							to: admin.email,
							subject: 'License Expired',
							html: `
								<h1>License Expired</h1>
								<p>Hello ${admin.name},</p>
								<p>Your license for ${organization?.name} has expired.</p>
								<ul>
									<li><strong>License Key:</strong> ${license.license_key}</li>
									<li><strong>Expired On:</strong> ${validUntil.toLocaleDateString()}</li>
								</ul>
								<p>Please contact support to renew your license.</p>
							`,
						})

						await ctx.db.insert('notifications', {
							organization_id: license.organization_id,
							admin_id: admin.id,
							type: 'license_expiry',
							subject: 'License Expired',
							message: `License ${license.license_key} expired on ${validUntil.toLocaleDateString()}`,
							status: 'sent',
						})

						notificationsSent++
					}
				} catch (error) {
					ctx.logger.error('Failed to send expiry notification', {
						error,
						licenseId: license.id,
					})
				}
			}
			// Check if license is expiring within 7 days
			else if (validUntil <= sevenDaysFromNow) {
				expiringSoon++

				const daysRemaining = Math.ceil(
					(validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
				)

				// Send expiring soon notification
				try {
					const organization = await ctx.db
						.from('organizations')
						.eq('id', license.organization_id)
						.single()

					const admins = await ctx.db
						.from('organization_admins')
						.eq('organization_id', license.organization_id)
						.exec()

					for (const admin of admins) {
						await ctx.mailer.send({
							to: admin.email,
							subject: 'License Expiring Soon',
							html: `
								<h1>License Expiring Soon</h1>
								<p>Hello ${admin.name},</p>
								<p>Your license for ${organization?.name} is expiring soon.</p>
								<ul>
									<li><strong>License Key:</strong> ${license.license_key}</li>
									<li><strong>Days Remaining:</strong> ${daysRemaining}</li>
									<li><strong>Expires On:</strong> ${validUntil.toLocaleDateString()}</li>
								</ul>
								<p>Please contact support to renew your license before it expires.</p>
							`,
						})

						await ctx.db.insert('notifications', {
							organization_id: license.organization_id,
							admin_id: admin.id,
							type: 'license_expiry',
							subject: 'License Expiring Soon',
							message: `License ${license.license_key} expires in ${daysRemaining} days`,
							status: 'sent',
						})

						notificationsSent++
					}
				} catch (error) {
					ctx.logger.error('Failed to send expiring soon notification', {
						error,
						licenseId: license.id,
					})
				}
			}
		}

		ctx.logger.info('License expiry check completed', {
			checked: activeLicenses.length,
			expiringSoon,
			expired,
			notificationsSent,
		})

		return {
			checked: activeLicenses.length,
			expiring_soon: expiringSoon,
			expired,
			notifications_sent: notificationsSent,
		}
	},
)
