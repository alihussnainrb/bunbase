import { default as t } from 'typebox'
import { action } from '../../core/action.ts'
import { triggers } from '../../core/triggers/index.ts'
import type { ActionDefinition } from '../../core/types.ts'
import { NotFound } from '../../utils/errors.ts'

// Get run details by ID
export const getRunDetails: ActionDefinition = action(
	{
		name: 'studio.getRunDetails',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			action: t.String(),
			status: t.String(),
			duration: t.Number(),
			timestamp: t.String(),
			input: t.Any(),
			output: t.Any(),
			error: t.Optional(t.String()),
		}),
		triggers: [triggers.api('GET', '/_studio/api/runs/:id')],
	},
	async (input, ctx) => {
		// Try to fetch from DB
		if (ctx.db) {
			try {
				const row = await ctx.db
					.from('action_runs' as any)
					.eq('id' as any, input.id)
					.single()

				if (!row) {
					throw new NotFound(`Run with id '${input.id}' not found`)
				}

				return {
					id: (row as any).id,
					action: (row as any).action_name,
					status: (row as any).status,
					duration: (row as any).duration_ms,
					timestamp: new Date((row as any).started_at).toISOString(),
					input: (row as any).input ? JSON.parse((row as any).input) : null,
					output: (row as any).output ? JSON.parse((row as any).output) : null,
					error: (row as any).error ?? undefined,
				}
			} catch (err) {
				if (err instanceof NotFound) throw err
				// DB not available
			}
		}

		throw new NotFound(`Run with id '${input.id}' not found`)
	},
)
