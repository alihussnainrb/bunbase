import { action, t, triggers } from 'bunbase'

/**
 * Event-triggered action — runs when a 'task.created' event is emitted.
 * Demonstrates: event triggers, background processing, decoupled logic.
 *
 * In a real app, this might send a notification, update analytics,
 * or trigger a webhook to an external service.
 */
export default action(
	{
		name: 'onTaskCreated',
		description: 'Handle task creation events (send notifications, etc.)',
		input: t.Object({
			taskId: t.String(),
			title: t.String(),
			createdBy: t.String(),
		}),
		output: t.Object({
			notified: t.Boolean(),
		}),
		triggers: [triggers.event('task.created')],
		// No API trigger — this only runs from events
	},
	async (input, ctx) => {
		ctx.logger.info('Task created event received', {
			taskId: input.taskId,
			title: input.title,
			createdBy: input.createdBy,
		})

		// Simulate sending a notification
		ctx.logger.info(`[Notification] New task "${input.title}" created by ${input.createdBy}`)

		return { notified: true }
	},
)
