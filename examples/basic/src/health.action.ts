import { action, t, triggers } from 'bunbase'

/**
 * Standalone action (not part of any module).
 * Demonstrates: basic action, API trigger, no guards (public endpoint), database stats.
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

		// Query task statistics from database
		const tasks = await ctx.db.from('tasks').select('status').exec()

		const stats = {
			total: tasks.length,
			pending: tasks.filter((t: any) => t.status === 'pending').length,
			inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
			completed: tasks.filter((t: any) => t.status === 'completed').length,
		}

		return {
			status: 'ok',
			uptime: process.uptime(),
			stats,
		}
	},
)
