import { action, t, triggers } from 'bunbase'

/**
 * Create a new task using the database.
 * Demonstrates: POST trigger, ctx.db usage, input validation, event emission.
 */
export const createTaskAction = action(
	{
		name: 'createTask',
		description: 'Create a new task',
		input: t.Object({
			title: t.String({ minLength: 1, maxLength: 200 }),
			description: t.Optional(t.String()),
			assigneeId: t.Optional(t.String()),
		}),
		output: t.Object({
			id: t.String(),
			title: t.String(),
			status: t.String(),
			createdBy: t.String(),
			createdAt: t.String(),
		}),
		triggers: [triggers.api('POST', '/')],
		// Guards inherited from module: authenticated()
	},
	async (input, ctx) => {
		ctx.logger.info('Creating task', { title: input.title })

		// Insert task into database
		const task = await ctx.db
			.from('tasks')
			.insert({
				title: input.title,
				description: input.description ?? '',
				created_by: ctx.auth.userId!,
				assignee_id: input.assigneeId,
				status: 'pending',
			})
			.returning('id', 'title', 'status', 'created_by', 'created_at')
			.single()

		// Emit event — this triggers onTaskCreated action
		ctx.event.emit('task.created', {
			taskId: task.id,
			title: task.title,
			createdBy: task.created_by,
		})

		ctx.logger.info('Task created', { taskId: task.id })

		return {
			id: task.id,
			title: task.title,
			status: task.status,
			createdBy: task.created_by,
			createdAt: task.created_at,
		}
	},
)
