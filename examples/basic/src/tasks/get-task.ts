import { action, t, triggers } from 'bunbase'
import { getTask } from '../lib/store.ts'

/**
 * Get a single task by ID.
 * Demonstrates: path parameters (:id), single resource lookup.
 */
export const getTaskAction = action(
	{
		name: 'getTask',
		description: 'Get a task by its ID',
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
		ctx.logger.debug('Getting task', { id: input.id })

		const task = getTask(input.id)
		if (!task) {
			throw new Error(`Task not found: ${input.id}`)
		}

		return {
			id: task.id,
			title: task.title,
			description: task.description,
			status: task.status,
			assigneeId: task.assigneeId,
			createdBy: task.createdBy,
			createdAt: task.createdAt.toISOString(),
			completedAt: task.completedAt?.toISOString() ?? null,
		}
	},
)
