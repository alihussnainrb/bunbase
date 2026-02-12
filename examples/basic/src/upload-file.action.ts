import { action, t, triggers } from 'bunbase'

/**
 * Upload a file to storage.
 * Demonstrates: File upload, ctx.storage usage, binary data handling.
 */
export const uploadFile = action(
	{
		name: 'uploadFile',
		description: 'Upload a file to storage',
		input: t.Object({
			filename: t.String(),
			content: t.String({ description: 'Base64 encoded file content' }),
			contentType: t.Optional(t.String()),
		}),
		output: t.Object({
			success: t.Boolean(),
			filename: t.String(),
			url: t.String(),
		}),
		triggers: [triggers.api('POST', '/upload')],
	},
	async (input, ctx) => {
		ctx.logger.info('Uploading file', { filename: input.filename })

		// Decode base64 content
		const buffer = Buffer.from(input.content, 'base64')

		// Upload to storage
		await ctx.storage.upload(input.filename, buffer, {
			contentType: input.contentType,
		})

		// Get URL for the uploaded file
		const url = await ctx.storage.getUrl(input.filename)

		ctx.logger.info('File uploaded', {
			filename: input.filename,
			size: buffer.length,
		})

		return {
			success: true,
			filename: input.filename,
			url,
		}
	},
)
