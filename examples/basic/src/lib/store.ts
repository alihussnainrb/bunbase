/**
 * Simple in-memory store for the example.
 * In a real app, you'd use ctx.db (TypedQueryBuilder) against Postgres.
 */

export interface User {
	id: string
	email: string
	name: string
	passwordHash: string
	createdAt: Date
}

export interface Task {
	id: string
	title: string
	description: string
	status: 'pending' | 'in_progress' | 'completed'
	assigneeId: string | null
	createdBy: string
	createdAt: Date
	completedAt: Date | null
}

// ── In-memory stores ─────────────────────────────────

const users = new Map<string, User>()
const tasks = new Map<string, Task>()

// Seed a demo user (password: "password123")
users.set('user-1', {
	id: 'user-1',
	email: 'demo@example.com',
	name: 'Demo User',
	// Pre-hashed "password123" — in real code use Bun.password.hash()
	passwordHash: 'password123',
	createdAt: new Date(),
})

let taskCounter = 0

function nextId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${(++taskCounter).toString(36)}`
}

// ── User operations ──────────────────────────────────

export function findUserByEmail(email: string): User | undefined {
	for (const user of users.values()) {
		if (user.email === email) return user
	}
	return undefined
}

export function findUserById(id: string): User | undefined {
	return users.get(id)
}

// ── Task operations ──────────────────────────────────

export function createTask(data: {
	title: string
	description: string
	createdBy: string
	assigneeId?: string
}): Task {
	const task: Task = {
		id: nextId('task'),
		title: data.title,
		description: data.description,
		status: 'pending',
		assigneeId: data.assigneeId ?? null,
		createdBy: data.createdBy,
		createdAt: new Date(),
		completedAt: null,
	}
	tasks.set(task.id, task)
	return task
}

export function getTask(id: string): Task | undefined {
	return tasks.get(id)
}

export function listTasks(filters?: {
	status?: string
	assigneeId?: string
}): Task[] {
	let result = Array.from(tasks.values())

	if (filters?.status) {
		result = result.filter((t) => t.status === filters.status)
	}
	if (filters?.assigneeId) {
		result = result.filter((t) => t.assigneeId === filters.assigneeId)
	}

	return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export function updateTask(
	id: string,
	data: Partial<
		Pick<
			Task,
			'title' | 'description' | 'status' | 'assigneeId' | 'completedAt'
		>
	>,
): Task | undefined {
	const task = tasks.get(id)
	if (!task) return undefined

	Object.assign(task, data)
	return task
}

export function deleteTask(id: string): boolean {
	return tasks.delete(id)
}

export function getTaskStats(): {
	total: number
	pending: number
	inProgress: number
	completed: number
} {
	const all = Array.from(tasks.values())
	return {
		total: all.length,
		pending: all.filter((t) => t.status === 'pending').length,
		inProgress: all.filter((t) => t.status === 'in_progress').length,
		completed: all.filter((t) => t.status === 'completed').length,
	}
}
