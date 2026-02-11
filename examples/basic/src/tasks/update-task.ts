import { action, t, triggers } from 'bunbase'

/**
 * Update a task.
 * Demonstrates: PATCH trigger, partial updates, database updates, event emission.
 */
export const updateTaskAction = action(
	{
		name: 'updateTask',
		description: 'Update a task',
		input: t.Object({
			id: t.String(),
			title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
			description: t.Optional(t.String()),
			status: t.Optional(t.Union([t.Literal('pending'), t.Literal('in_progress'), t.Literal('completed')])),
			assigneeId: t.Optional(t.String()),
		}),
		output: t.Object({
			id: t.String(),
			title: t.String(),
			status: t.String(),
		}),
		triggers: [triggers.api('PATCH', '/:id')],
	},
	async (input, ctx) => {
		ctx.logger.info('Updating task', { taskId: input.id })

		// Check if task exists
		const existing = await ctx.db
			.from('tasks')
			.eq('id', input.id)
			.select('id', 'status')
			.single()

		if (!existing) {
			throw new Error(`Task ${input.id} not found`)
		}

		// Build update object
		const updates: any = {}
		if (input.title !== undefined) updates.title = input.title
		if (input.description !== undefined) updates.description = input.description
		if (input.assigneeId !== undefined) updates.assignee_id = input.assigneeId

		// Handle status transitions
		if (input.status !== undefined) {
			updates.status = input.status
			if (input.status === 'completed' && existing.status !== 'completed') {
				updates.completed_at = new Date().toISOString()
				// Emit completion event
				ctx.event.emit('task.completed', {
					taskId: input.id,
					completedBy: ctx.auth.userId,
				})
				ctx.logger.info('Task completed', { taskId: input.id })
			}
		}

		const updated = await ctx.db
			.from('tasks')
			.eq('id', input.id)
			.update(updates)
			.returning('id', 'title', 'status')
			.single()

		ctx.logger.info('Task updated', { taskId: input.id })

		return {
			id: updated.id,
			title: updated.title,
			status: updated.status,
		}
	},
)
