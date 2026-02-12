import { default as t } from 'typebox'
import { action } from '../../core/action.ts'
import { triggers } from '../../core/triggers/index.ts'
import type { ActionDefinition } from '../../core/types.ts'

// Get all actions with their statistics
export const getActions: ActionDefinition = action(
	{
		name: 'studio.getActions',
		input: t.Object({
			limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
			offset: t.Optional(t.Number({ minimum: 0 })),
		}),
		output: t.Object({
			actions: t.Array(
				t.Object({
					id: t.String(),
					name: t.String(),
					description: t.String(),
					method: t.String(),
					path: t.String(),
					triggers: t.Number(),
					runs: t.Number(),
					successRate: t.Number(),
					avgDuration: t.Number(),
					createdAt: t.String(),
				}),
			),
			total: t.Number(),
			hasMore: t.Boolean(),
		}),
		triggers: [triggers.api('GET', '/_studio/api/actions')],
	},
	async (input, ctx) => {
		const registry = ctx.registry
		const limit = input.limit ?? 20
		const offset = input.offset ?? 0

		if (!registry) {
			return { actions: [], total: 0, hasMore: false }
		}

		const allActions = registry.getAll()
		const actionList = allActions.map((registered, index) => {
			const config = registered.definition.config
			const apiTrigger = registered.triggers.find((t) => t.type === 'api')

			return {
				id: String(index + 1),
				name: config.name,
				description: config.description ?? '',
				method:
					apiTrigger && apiTrigger.type === 'api' ? apiTrigger.method : 'N/A',
				path:
					apiTrigger &&
					(apiTrigger.type === 'api' || apiTrigger.type === 'webhook')
						? apiTrigger.path
						: '',
				triggers: registered.triggers.length,
				runs: 0,
				successRate: 0,
				avgDuration: 0,
				createdAt: new Date().toISOString(),
			}
		})

		// Try to enrich with run stats from DB if available
		if (ctx.db) {
			try {
				for (const action of actionList) {
					const runs = await ctx.db
						.from('action_runs' as any)
						.eq('action_name' as any, action.name)
						.exec()

					if (runs.length > 0) {
						action.runs = runs.length
						const successful = runs.filter((r: any) => r.status === 'success')
						action.successRate =
							runs.length > 0 ? (successful.length / runs.length) * 100 : 0
						const totalDuration = runs.reduce(
							(sum: number, r: any) => sum + (r.duration_ms ?? 0),
							0,
						)
						action.avgDuration =
							runs.length > 0 ? totalDuration / runs.length : 0
					}
				}
			} catch {
				// DB not available, stats remain at defaults
			}
		}

		const sliced = actionList.slice(offset, offset + limit)

		return {
			actions: sliced,
			total: actionList.length,
			hasMore: offset + limit < actionList.length,
		}
	},
)
