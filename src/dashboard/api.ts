import type { SQL } from 'bun'
import type { ActionRegistry } from '../core/registry.ts'
import type { Logger } from '../logger/index.ts'
import type { Queue } from '../runtime/queue.ts'
import type { Scheduler } from '../runtime/scheduler.ts'

export interface DashboardStats {
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

/**
 * Dashboard API for the developer dashboard UI.
 * Provides stats, actions list, runs history, and job queue info.
 */
export class DashboardAPI {
    constructor(
        private readonly registry: ActionRegistry,
        private readonly sql: SQL,
        private readonly logger: Logger,
        private readonly queue: Queue | undefined,
        private readonly scheduler: Scheduler | undefined,
    ) {}

    async getStats(): Promise<DashboardStats> {
        const actionCount = this.registry.getAll().length

        const [runStats] = await this.sql`
            SELECT COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'error') as errors
            FROM action_runs
            WHERE started_at > ${Date.now() - 24 * 60 * 60 * 1000}
        `

        const queueStats = this.queue
            ? await this.queue.getStats()
            : { pending: 0 }

        return {
            actions: actionCount,
            runs: parseInt(runStats.total, 10),
            jobs: queueStats.pending,
            errors: parseInt(runStats.errors, 10),
        }
    }

    getActions(): ActionInfo[] {
        return this.registry.getAll().map((action) => ({
            name: action.definition.config.name,
            module: action.moduleName ?? undefined,
            description: action.definition.config.description,
            triggers: action.triggers.map((t) => t.type),
            guards: action.guards.length,
        }))
    }

    async getRecentRuns(limit = 50): Promise<RunInfo[]> {
        const rows = await this.sql`
            SELECT id, action_name, module_name, status, duration_ms, started_at, error
            FROM action_runs
            ORDER BY started_at DESC
            LIMIT ${limit}
        `

        return rows.map((r: any) => ({
            id: r.id,
            action: r.action_name,
            module: r.module_name,
            status: r.status,
            duration_ms: r.duration_ms,
            started_at: r.started_at,
            error: r.error,
        }))
    }

    async getJobs(opts: { status?: string; limit?: number } = {}): Promise<Array<{ id: string; name: string; status: string; attempts: number; maxAttempts: number; createdAt: Date }>> {
        if (!this.queue) return []

        const jobs = await this.queue.getAll({
            status: opts.status as any,
            limit: opts.limit ?? 50,
        })

        return jobs.map((j) => ({
            id: j.id,
            name: j.name,
            status: j.status,
            attempts: j.attempts,
            maxAttempts: j.maxAttempts,
            createdAt: j.createdAt,
        }))
    }

    async getScheduledTasks(): Promise<Array<{ id: string; name: string; type: string; schedule: string | Date | number; nextRun?: Date; enabled: boolean }>> {
        if (!this.scheduler) return []
        return this.scheduler.listTasks()
    }
}
