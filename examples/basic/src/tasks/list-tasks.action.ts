import { action, t, triggers } from 'bunbase'

/**
 * List tasks with optional filtering.
 * Demonstrates: GET trigger, query parameters, database querying with filters.
 */
export const listTasksAction = action(
	{
		name: 'listTasks',
		description: 'List all tasks with optional filters',
		input: t.Object({
			status: t.Optional(t.String()),
			assigneeId: t.Optional(t.String()),
			limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
		}),
		output: t.Object({
			tasks: t.Array(
				t.Object({
					id: t.String(),
					title: t.String(),
					description: t.String(),
					status: t.String(),
					assigneeId: t.Union([t.String(), t.Null()]),
					createdBy: t.String(),
					createdAt: t.String(),
					completedAt: t.Union([t.String(), t.Null()]),
				}),
			),
			total: t.Number(),
		}),
		triggers: [triggers.api('GET', '/')],
	},
	async (input, ctx) => {
		ctx.logger.info('Listing tasks', input)

		// Build query with optional filters
		let query = ctx.db.from('tasks').select('*')

		if (input.status) {
			query = query.eq('status', input.status)
		}
		if (input.assigneeId) {
			query = query.eq('assignee_id', input.assigneeId)
		}

		query = query.limit(input.limit ?? 50).orderBy('created_at', 'desc')

		const tasks = await query.exec()

		return {
			tasks: tasks.map((t: any) => ({
				id: t.id,
				title: t.title,
				description: t.description,
				status: t.status,
				assigneeId: t.assignee_id,
				createdBy: t.created_by,
				createdAt: t.created_at,
				completedAt: t.completed_at,
			})),
			total: tasks.length,
		}
	},
)
