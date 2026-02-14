import { action, t, triggers } from 'bunbase'

export const revokeLicense = action(
	{
		name: 'revoke-license',
		description: 'Revoke an active license',
		input: t.Object({
			id: t.String(),
			reason: t.Optional(t.String()),
		}),
		output: t.Object({
			id: t.String(),
			license_key: t.String(),
			status: t.String(),
		}),
		triggers: [triggers.api('PATCH', '/:id/revoke')],
	},
	async (input, ctx) => {
		const license = await ctx.db.from('licenses').eq('id', input.id).single()

		if (!license) {
			throw new Error('License not found')
		}

		if (license.status === 'Revoked') {
			throw new Error('License is already revoked')
		}

		// Revoke license
		const updated = await ctx.db
			.update('licenses')
			.eq('id', input.id)
			.set({
				status: 'Revoked',
				updated_at: new Date().toISOString(),
			})
			.returning('id', 'license_key', 'status')
			.single()

		if (!updated) {
			throw new Error('Failed to revoke license')
		}

		// Notify organization admins
		try {
			const admins = await ctx.db
				.from('organization_admins')
				.eq('organization_id', license.organization_id)
				.exec()

			const organization = await ctx.db
				.from('organizations')
				.eq('id', license.organization_id)
				.single()

			for (const admin of admins) {
				await ctx.mailer.send({
					to: admin.email,
					subject: 'License Revoked',
					html: `
						<h1>License Revoked</h1>
						<p>Hello ${admin.name},</p>
						<p>License ${license.license_key} for ${organization?.name} has been revoked.</p>
						${input.reason ? `<p><strong>Reason:</strong> ${input.reason}</p>` : ''}
						<p>Please contact support for more information.</p>
					`,
				})

				await ctx.db.insert('notifications', {
					organization_id: license.organization_id,
					admin_id: admin.id,
					type: 'license_revoked',
					subject: 'License Revoked',
					message: input.reason || 'License has been revoked',
					status: 'sent',
				})
			}
		} catch (error) {
			ctx.logger.error('Failed to send revocation notification', { error })
		}

		ctx.logger.info('License revoked', {
			licenseId: input.id,
			reason: input.reason,
		})

		return {
			id: updated.id,
			license_key: updated.license_key,
			status: updated.status,
		}
	},
)
