import { action, t, triggers } from 'bunbase'

/**
 * Get a single task by ID.
 * Demonstrates: Path parameters, single record query, 404 handling.
 */
export const getTaskAction = action(
	{
		name: 'getTask',
		description: 'Get a task by ID',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			id: t.String(),
			title: t.String(),
			description: t.String(),
			status: t.String(),
			assigneeId: t.Union([t.String(), t.Null()]),
			createdBy: t.String(),
			createdAt: t.String(),
			completedAt: t.Union([t.String(), t.Null()]),
		}),
		triggers: [triggers.api('GET', '/:id')],
	},
	async (input, ctx) => {
		ctx.logger.info('Getting task', { taskId: input.id })

		const task = await ctx.db
			.from('tasks')
			.eq('id', input.id)
			.select('*')
			.single()

		if (!task) {
			throw new Error(`Task ${input.id} not found`)
		}

		return {
			id: task.id,
			title: task.title,
			description: task.description,
			status: task.status,
			assigneeId: task.assignee_id,
			createdBy: task.created_by,
			createdAt: task.created_at,
			completedAt: task.completed_at,
		}
	},
)
