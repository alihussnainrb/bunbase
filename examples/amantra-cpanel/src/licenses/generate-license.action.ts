import { action, t, triggers } from 'bunbase'
import { randomBytes } from 'node:crypto'

export const generateLicense = action(
	{
		name: 'generate-license',
		description: 'Generate a new license for an organization',
		input: t.Object({
			organization_id: t.String(),
			module_ids: t.Array(t.String()),
			operational_users_limit: t.Number({ minimum: 1 }),
			frameworks_limit: t.Number({ minimum: 1 }),
			duration_days: t.Number({ minimum: 1 }),
		}),
		output: t.Object({
			id: t.String(),
			license_key: t.String(),
			organization_id: t.String(),
			valid_from: t.String(),
			valid_until: t.String(),
			status: t.String(),
			license_file_path: t.String(),
		}),
		triggers: [triggers.api('POST', '/')],
	},
	async ({ input, ctx }) => {
		// Verify organization exists
		const organization = await ctx.db
			.from('organizations')
			.eq('id', input.organization_id)
			.single()

		if (!organization) {
			throw new Error('Organization not found')
		}

		// Verify modules exist
		const modules = await ctx.db.from('modules').in('id', input.module_ids).exec()

		if (modules.length !== input.module_ids.length) {
			throw new Error('One or more module IDs are invalid')
		}

		// Generate unique license key
		const licenseKey = `AMANTRA-${organization.name.substring(0, 3).toUpperCase()}-${randomBytes(8).toString('hex').toUpperCase()}`

		// Calculate validity period
		const validFrom = new Date()
		const validUntil = new Date(validFrom.getTime() + input.duration_days * 24 * 60 * 60 * 1000)

		// Create license
		const license = await ctx.db
			.insert('licenses', {
				organization_id: input.organization_id,
				license_key: licenseKey,
				operational_users_limit: input.operational_users_limit,
				frameworks_limit: input.frameworks_limit,
				duration_days: input.duration_days,
				valid_from: validFrom.toISOString(),
				valid_until: validUntil.toISOString(),
				status: 'Active',
			})
			.returning('id', 'license_key', 'organization_id', 'valid_from', 'valid_until', 'status')
			.single()

		// Associate modules with license
		for (const moduleId of input.module_ids) {
			await ctx.db.insert('license_modules', {
				license_id: license.id,
				module_id: moduleId,
			})
		}

		// Generate license JSON file
		const licenseData = {
			license_key: license.license_key,
			organization: {
				id: organization.id,
				name: organization.name,
				email: organization.email,
			},
			operational_users_limit: input.operational_users_limit,
			frameworks_limit: input.frameworks_limit,
			modules: modules.map((m) => m.name),
			valid_from: license.valid_from,
			valid_until: license.valid_until,
			issued_at: new Date().toISOString(),
			status: 'Active',
		}

		// Save license file to storage
		const filename = `${organization.name.replace(/\s+/g, '')}-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`
		const licenseFilePath = `licenses/${license.id}/${filename}`

		await ctx.storage.put(licenseFilePath, Buffer.from(JSON.stringify(licenseData, null, 2)), {
			contentType: 'application/json',
		})

		// Update license with file path
		await ctx.db
			.update('licenses')
			.eq('id', license.id)
			.set({ license_file_path: licenseFilePath })

		// Send notification to organization admins
		try {
			const admins = await ctx.db
				.from('organization_admins')
				.eq('organization_id', input.organization_id)
				.exec()

			for (const admin of admins) {
				await ctx.mailer.send({
					to: admin.email,
					subject: 'New License Generated',
					html: `
						<h1>New License Generated</h1>
						<p>Hello ${admin.name},</p>
						<p>A new license has been generated for ${organization.name}.</p>
						<ul>
							<li><strong>License Key:</strong> ${license.license_key}</li>
							<li><strong>Valid From:</strong> ${new Date(license.valid_from).toLocaleDateString()}</li>
							<li><strong>Valid Until:</strong> ${new Date(license.valid_until).toLocaleDateString()}</li>
							<li><strong>Modules:</strong> ${modules.map((m) => m.name).join(', ')}</li>
						</ul>
					`,
				})

				await ctx.db.insert('notifications', {
					organization_id: input.organization_id,
					admin_id: admin.id,
					type: 'license_generated',
					subject: 'New License Generated',
					message: `License ${license.license_key} generated`,
					status: 'sent',
				})
			}
		} catch (error) {
			ctx.logger.error('Failed to send license notification', { error })
		}

		ctx.logger.info('License generated', {
			licenseId: license.id,
			organizationId: input.organization_id,
		})

		return {
			id: license.id,
			license_key: license.license_key,
			organization_id: license.organization_id,
			valid_from: license.valid_from,
			valid_until: license.valid_until,
			status: license.status,
			license_file_path: licenseFilePath,
		}
	},
)
