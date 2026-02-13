import { action, t, triggers } from 'bunbase'

export const uploadVersionContent = action(
	{
		name: 'upload-framework-version-content',
		description: 'Upload JSON content for a framework version',
		input: t.Object({
			frameworkId: t.String(),
			versionId: t.String(),
			content: t.Unknown(), // JSON content
		}),
		output: t.Object({
			id: t.String(),
			version: t.String(),
			has_content: t.Boolean(),
			updated_at: t.String(),
		}),
		triggers: [
			triggers.api('POST', '/:frameworkId/versions/:versionId/upload'),
		],
	},
	async ({ input, ctx }) => {
		// Verify version exists and belongs to framework
		const version = await ctx.db
			.from('framework_versions')
			.eq('id', input.versionId)
			.eq('framework_id', input.frameworkId)
			.single()

		if (!version) {
			throw new Error('Framework version not found')
		}

		// Store content as JSONB in database
		const updated = await ctx.db
			.update('framework_versions')
			.eq('id', input.versionId)
			.set({
				content_json: input.content,
				updated_at: new Date().toISOString(),
			})
			.returning('id', 'version', 'content_json', 'updated_at')
			.single()

		if (!updated) {
			throw new Error('Failed to upload content')
		}

		ctx.logger.info('Framework version content uploaded', {
			frameworkId: input.frameworkId,
			versionId: input.versionId,
		})

		return {
			id: updated.id,
			version: updated.version,
			has_content: !!updated.content_json,
			updated_at: updated.updated_at,
		}
	},
)
