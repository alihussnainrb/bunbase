import { action, t, triggers } from 'bunbase'
import { getTaskStats } from './lib/store.ts'

/**
 * Standalone action (not part of any module).
 * Demonstrates: basic action, API trigger, no guards (public endpoint).
 */
export default action(
	{
		name: 'healthCheck',
		description: 'Returns server health status and task statistics',
		input: t.Object({}),
		output: t.Object({
			status: t.String(),
			uptime: t.Number(),
			stats: t.Object({
				total: t.Number(),
				pending: t.Number(),
				inProgress: t.Number(),
				completed: t.Number(),
			}),
		}),
		triggers: [triggers.api('GET', '/health')],
		// No guards — this is a public endpoint
	},
	async (_input, ctx) => {
		ctx.logger.info('Health check requested')

		return {
			status: 'ok',
			uptime: process.uptime(),
			stats: getTaskStats(),
		}
	},
)
