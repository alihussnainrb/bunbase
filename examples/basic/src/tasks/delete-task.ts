import { action, t, triggers } from 'bunbase'
import { deleteTask, getTask } from '../lib/store.ts'

/**
 * Delete a task by ID.
 * Demonstrates: DELETE trigger, path parameters.
 */
export const deleteTaskAction = action(
	{
		name: 'deleteTask',
		description: 'Delete a task by its ID',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
			deletedId: t.String(),
		}),
		triggers: [triggers.api('DELETE', '/:id')],
	},
	async (input, ctx) => {
		const task = getTask(input.id)
		if (!task) {
			throw new Error(`Task not found: ${input.id}`)
		}

		deleteTask(input.id)
		ctx.logger.info('Task deleted', { taskId: input.id })

		return {
			success: true,
			deletedId: input.id,
		}
	},
)
