import { guards, module } from 'bunbase'
import { createTaskAction } from './create-task.ts'
import { deleteTaskAction } from './delete-task.ts'
import { getTaskAction } from './get-task.ts'
import { listTasksAction } from './list-tasks.ts'
import { updateTaskAction } from './update-task.ts'

/**
 * Tasks module — groups all task CRUD actions under /tasks prefix.
 * Module-level guards apply to ALL actions in this module.
 *
 * Note: The onTaskCreated event handler is a standalone action (src/on-task-created.ts)
 * because event-triggered actions shouldn't go through the module's auth guard.
 *
 * Demonstrates: module definition, shared apiPrefix, shared guards,
 * guard cascade (module guards run before action guards).
 */
export default module({
	name: 'tasks',
	description: 'Task management CRUD operations',
	apiPrefix: '/tasks',
	guards: [
		guards.authenticated(), // All task endpoints require login
	],
	actions: [
		createTaskAction,
		listTasksAction,
		getTaskAction,
		updateTaskAction,
		deleteTaskAction,
	],
})
