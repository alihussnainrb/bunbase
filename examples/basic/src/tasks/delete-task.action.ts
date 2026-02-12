import { action, t, triggers } from 'bunbase'

/**
 * Delete a task.
 * Demonstrates: DELETE trigger, database deletion.
 */
export const deleteTaskAction = action(
	{
		name: 'deleteTask',
		description: 'Delete a task',
		input: t.Object({
			id: t.String(),
		}),
		output: t.Object({
			success: t.Boolean(),
		}),
		triggers: [triggers.api('DELETE', '/:id')],
	},
	async (input, ctx) => {
		ctx.logger.info('Deleting task', { taskId: input.id })

		await ctx.db.from('tasks').eq('id', input.id).delete()

		ctx.logger.info('Task deleted', { taskId: input.id })

		return { success: true }
	},
)
