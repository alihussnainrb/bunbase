import { action, t, triggers } from 'bunbase'
import { listTasks } from '../lib/store.ts'

/**
 * List tasks with optional filters.
 * Demonstrates: GET trigger, query parameter input, array output.
 */
export const listTasksAction = action(
	{
		name: 'listTasks',
		description: 'List all tasks with optional status filter',
		input: t.Object({
			status: t.Optional(t.String()),
			assigneeId: t.Optional(t.String()),
		}),
		output: t.Object({
			tasks: t.Array(
				t.Object({
					id: t.String(),
					title: t.String(),
					status: t.String(),
					assigneeId: t.Union([t.String(), t.Null()]),
					createdBy: t.String(),
					createdAt: t.String(),
				}),
			),
			count: t.Number(),
		}),
		triggers: [triggers.api('GET', '/')],
	},
	async (input, ctx) => {
		ctx.logger.debug('Listing tasks', { filters: input })

		const tasks = listTasks({
			status: input.status,
			assigneeId: input.assigneeId,
		})

		return {
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				status: t.status,
				assigneeId: t.assigneeId,
				createdBy: t.createdBy,
				createdAt: t.createdAt.toISOString(),
			})),
			count: tasks.length,
		}
	},
)
