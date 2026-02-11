const API_BASE = '/_admin/api'

export interface Stats {
	actions: number
	runs: number
	jobs: number
	errors: number
}

export interface ActionInfo {
	name: string
	module?: string
	description?: string
	triggers: string[]
	guards: number
}

export interface RunInfo {
	id: string
	action: string
	module?: string
	status: 'success' | 'error'
	duration_ms: number
	started_at: number
	error?: string
}

export interface JobInfo {
	id: string
	name: string
	status: string
	attempts: number
	maxAttempts: number
	createdAt: string
}

class DashboardAPI {
	async getStats(): Promise<Stats> {
		const res = await fetch(`${API_BASE}/stats`)
		if (!res.ok) throw new Error('Failed to fetch stats')
		return res.json()
	}

	async getActions(): Promise<ActionInfo[]> {
		const res = await fetch(`${API_BASE}/actions`)
		if (!res.ok) throw new Error('Failed to fetch actions')
		return res.json()
	}

	async getRuns(limit = 50): Promise<RunInfo[]> {
		const res = await fetch(`${API_BASE}/runs?limit=${limit}`)
		if (!res.ok) throw new Error('Failed to fetch runs')
		return res.json()
	}

	async getJobs(status?: string): Promise<JobInfo[]> {
		const url = status
			? `${API_BASE}/jobs?status=${status}`
			: `${API_BASE}/jobs`
		const res = await fetch(url)
		if (!res.ok) throw new Error('Failed to fetch jobs')
		return res.json()
	}
}

export const api = new DashboardAPI()
