import { action, t, triggers } from 'bunbase'

export const reactivateLicense = action(
	{
		name: 'reactivate-license',
		description: 'Reactivate a revoked or expired license',
		input: t.Object({
			id: t.String(),
			new_duration_days: t.Optional(t.Number({ minimum: 1 })),
		}),
		output: t.Object({
			id: t.String(),
			license_key: t.String(),
			status: t.String(),
			valid_from: t.String(),
			valid_until: t.String(),
		}),
		triggers: [triggers.api('PATCH', '/:id/reactivate')],
	},
	async ({ input, ctx }) => {
		const license = await ctx.db.from('licenses').eq('id', input.id).single()

		if (!license) {
			throw new Error('License not found')
		}

		if (license.status === 'Active') {
			throw new Error('License is already active')
		}

		// Calculate new validity period
		const validFrom = new Date()
		const durationDays = input.new_duration_days || license.duration_days
		const validUntil = new Date(
			validFrom.getTime() + durationDays * 24 * 60 * 60 * 1000,
		)

		// Reactivate license
		const updated = await ctx.db
			.update('licenses')
			.eq('id', input.id)
			.set({
				status: 'Active',
				valid_from: validFrom.toISOString(),
				valid_until: validUntil.toISOString(),
				duration_days: durationDays,
				updated_at: new Date().toISOString(),
			})
			.returning('id', 'license_key', 'status', 'valid_from', 'valid_until')
			.single()

		if (!updated) {
			throw new Error('Failed to reactivate license')
		}

		ctx.logger.info('License reactivated', { licenseId: input.id })

		return {
			id: updated.id,
			license_key: updated.license_key,
			status: updated.status,
			valid_from: updated.valid_from,
			valid_until: updated.valid_until,
		}
	},
)
