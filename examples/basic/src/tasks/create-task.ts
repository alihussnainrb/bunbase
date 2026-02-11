import { action, t, triggers } from 'bunbase'
import { createTask } from '../lib/store.ts'

/**
 * Create a new task.
 * Demonstrates: POST trigger, input validation, event emission, logging.
 *
 * After creating the task, emits a 'task.created' event which triggers
 * the onTaskCreated action (see on-task-created.ts).
 */
export const createTaskAction = action(
	{
		name: 'createTask',
		description: 'Create a new task',
		input: t.Object({
			title: t.String({ minLength: 1, maxLength: 200 }),
			description: t.String({ default: '' }),
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

		const task = createTask({
			title: input.title,
			description: input.description ?? '',
			createdBy: ctx.auth.userId!,
			assigneeId: input.assigneeId,
		})

		// Emit event — this triggers onTaskCreated action
		ctx.event.emit('task.created', {
			taskId: task.id,
			title: task.title,
			createdBy: task.createdBy,
		})

		ctx.logger.info('Task created', { taskId: task.id })

		return {
			id: task.id,
			title: task.title,
			status: task.status,
			createdBy: task.createdBy,
			createdAt: task.createdAt.toISOString(),
		}
	},
)
