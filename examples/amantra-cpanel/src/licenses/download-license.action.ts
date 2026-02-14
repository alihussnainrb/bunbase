import { action, t, triggers } from 'bunbase'

export const downloadLicense = action(
	{
		name: 'download-license',
		description: 'Download license JSON file',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			license_key: t.String(),
			content: t.String(), // Base64 encoded JSON
			filename: t.String(),
		}),
		triggers: [triggers.api('GET', '/:id/download')],
	},
	async (input, ctx) => {
		const license = await ctx.db.from('licenses').eq('id', input.id).single()

		if (!license) {
			throw new Error('License not found')
		}

		if (!license.license_file_path) {
			throw new Error('License file not found')
		}

		// Get license file from storage
		const fileBuffer = await ctx.storage.get(license.license_file_path)

		if (!fileBuffer) {
			throw new Error('Failed to retrieve license file')
		}

		// Extract filename from path
		const filename =
			license.license_file_path.split('/').pop() || 'license.json'

		ctx.logger.info('License downloaded', { licenseId: input.id })

		return {
			license_key: license.license_key,
			content: fileBuffer.toString('base64'),
			filename,
		}
	},
)
