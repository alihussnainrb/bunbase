import { action, t, triggers } from 'bunbase'
import { getTask, updateTask } from '../lib/store.ts'

/**
 * Update a task (change status, title, or assignee).
 * Demonstrates: PUT trigger, path parameters, partial updates, event emission.
 */
export const updateTaskAction = action(
	{
		name: 'updateTask',
		description: 'Update a task by ID',
		input: t.Object({
			id: t.String(),
			title: t.Optional(t.String({ minLength: 1 })),
			description: t.Optional(t.String()),
			status: t.Optional(
				t.Union([
					t.Literal('pending'),
					t.Literal('in_progress'),
					t.Literal('completed'),
				]),
			),
			assigneeId: t.Optional(t.Union([t.String(), t.Null()])),
		}),
		output: t.Object({
			id: t.String(),
			title: t.String(),
			status: t.String(),
			assigneeId: t.Union([t.String(), t.Null()]),
			completedAt: t.Union([t.String(), t.Null()]),
		}),
		triggers: [triggers.api('PUT', '/:id')],
	},
	async (input, ctx) => {
		const existing = getTask(input.id)
		if (!existing) {
			throw new Error(`Task not found: ${input.id}`)
		}

		const updates: Record<string, unknown> = {}
		if (input.title !== undefined) updates.title = input.title
		if (input.description !== undefined) updates.description = input.description
		if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId

		// Handle status transitions
		if (input.status !== undefined) {
			updates.status = input.status
			if (input.status === 'completed' && existing.status !== 'completed') {
				updates.completedAt = new Date()
				// Emit completion event
				ctx.event.emit('task.completed', {
					taskId: input.id,
					completedBy: ctx.auth.userId,
				})
				ctx.logger.info('Task completed', { taskId: input.id })
			}
		}

		const task = updateTask(input.id, updates as any)!

		return {
			id: task.id,
			title: task.title,
			status: task.status,
			assigneeId: task.assigneeId,
			completedAt: task.completedAt?.toISOString() ?? null,
		}
	},
)
