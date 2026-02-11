import { action, t, triggers } from 'bunbase'

/**
 * Download a file from storage.
 * Demonstrates: File download, ctx.storage usage, binary data response.
 */
export const downloadFile = action(
	{
		name: 'downloadFile',
		description: 'Download a file from storage',
		input: t.Object({
			filename: t.String(),
		}),
		output: t.Object({
			filename: t.String(),
			content: t.String({ description: 'Base64 encoded file content' }),
			exists: t.Boolean(),
		}),
		triggers: [triggers.api('GET', '/download/:filename')],
	},
	async (input, ctx) => {
		ctx.logger.info('Downloading file', { filename: input.filename })

		const buffer = await ctx.storage.download(input.filename)

		if (!buffer) {
			return {
				filename: input.filename,
				content: '',
				exists: false,
			}
		}

		// Encode to base64 for JSON response
		const content = buffer.toString('base64')

		ctx.logger.info('File downloaded', { filename: input.filename, size: buffer.length })

		return {
			filename: input.filename,
			content,
			exists: true,
		}
	},
)
