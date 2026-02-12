import { default as t } from 'typebox'
import { action } from '../../core/action.ts'
import { triggers } from '../../core/triggers/index.ts'
import type { ActionDefinition } from '../../core/types.ts'
import { NotFound } from '../../utils/errors.ts'

// Get action details by ID
export const getActionDetails: ActionDefinition = action(
	{
		name: 'studio.getActionDetails',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			name: t.String(),
			description: t.String(),
			method: t.String(),
			path: t.String(),
			triggers: t.Array(t.Any()),
			runs: t.Array(t.Any()),
			stats: t.Object({
				totalRuns: t.Number(),
				successRate: t.Number(),
				avgDuration: t.Number(),
				lastRun: t.String(),
			}),
		}),
		triggers: [triggers.api('GET', '/_studio/api/actions/:id')],
	},
	async (input, ctx) => {
		const registry = ctx.registry

		if (!registry) {
			throw new NotFound(`Action with id '${input.id}' not found`)
		}

		// Find action by index-based ID or by name
		const allActions = registry.getAll()
		const index = parseInt(input.id, 10) - 1
		const registered =
			index >= 0 && index < allActions.length
				? allActions[index]
				: allActions.find((a) => a.definition.config.name === input.id)

		if (!registered) {
			throw new NotFound(`Action with id '${input.id}' not found`)
		}

		const config = registered.definition.config
		const apiTrigger = registered.triggers.find((t) => t.type === 'api')

		const triggerList = registered.triggers.map((t) => ({
			type: t.type,
			config: t,
		}))

		// Try to get run data from DB
		let runs: any[] = []
		let stats = {
			totalRuns: 0,
			successRate: 0,
			avgDuration: 0,
			lastRun: new Date().toISOString(),
		}

		if (ctx.db) {
			try {
				const dbRuns = await ctx.db
					.from('action_runs' as any)
					.eq('action_name' as any, config.name)
					.orderBy('started_at' as any, 'DESC')
					.limit(20)
					.exec()

				runs = dbRuns.map((r: any) => ({
					id: r.id,
					status: r.status,
					duration: r.duration_ms,
					timestamp: new Date(r.started_at).toISOString(),
					input: r.input ? JSON.parse(r.input) : null,
					output: r.output ? JSON.parse(r.output) : null,
					error: r.error,
				}))

				if (dbRuns.length > 0) {
					const successful = dbRuns.filter((r: any) => r.status === 'success')
					stats = {
						totalRuns: dbRuns.length,
						successRate: (successful.length / dbRuns.length) * 100,
						avgDuration:
							dbRuns.reduce(
								(sum: number, r: any) => sum + (r.duration_ms ?? 0),
								0,
							) / dbRuns.length,
						lastRun: new Date(dbRuns[0]!.started_at).toISOString(),
					}
				}
			} catch {
				// DB not available
			}
		}

		return {
			id: input.id,
			name: config.name,
			description: config.description ?? '',
			method:
				apiTrigger && apiTrigger.type === 'api' ? apiTrigger.method : 'N/A',
			path:
				apiTrigger &&
				(apiTrigger.type === 'api' || apiTrigger.type === 'webhook')
					? apiTrigger.path
					: '',
			triggers: triggerList,
			runs,
			stats,
		}
	},
)
