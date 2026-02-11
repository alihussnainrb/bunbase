import type { SQL } from 'bun'
import type { LogEntry, RunEntry, WriteBufferOptions } from './types.ts'

/**
 * Buffered persistence layer for high-frequency writes.
 *
 * Logs and run history are accumulated in memory and flushed
 * to Postgres in batches — either on a timer or when the buffer
 * exceeds a size threshold. This avoids bombarding the DB on
 * every action invocation.
 */
export class WriteBuffer {
    private logs: LogEntry[] = []
    private runs: RunEntry[] = []
    private flushTimer: ReturnType<typeof setInterval> | null = null
    private readonly maxBufferSize: number
    private readonly flushIntervalMs: number
    private readonly enabled: boolean
    private flushing = false
    private sql: SQL | null = null

    constructor(opts: WriteBufferOptions = {}) {
        this.flushIntervalMs = opts.flushIntervalMs ?? 2000
        this.maxBufferSize = opts.maxBufferSize ?? 500
        this.enabled = opts.enabled ?? true
    }

    /** Attach the SQL pool — called during server boot */
    setSql(sql: SQL): void {
        this.sql = sql
        if (this.enabled) {
            this.flushTimer = setInterval(() => {
                void this.flush()
            }, this.flushIntervalMs)
        }
    }

    /** Push a log entry into the buffer */
    pushLog(entry: LogEntry): void {
        if (!this.enabled) return
        this.logs.push(entry)
        if (this.logs.length >= this.maxBufferSize) {
            void this.flush()
        }
    }

    /** Push a run entry into the buffer */
    pushRun(entry: RunEntry): void {
        if (!this.enabled) return
        this.runs.push(entry)
        if (this.runs.length >= this.maxBufferSize) {
            void this.flush()
        }
    }

    /** Flush all buffered entries to the database */
    async flush(): Promise<void> {
        if (!this.sql || this.flushing) return
        if (this.logs.length === 0 && this.runs.length === 0) return

        this.flushing = true

        // Swap buffers so new writes go to fresh arrays
        const logsToFlush = this.logs
        const runsToFlush = this.runs
        this.logs = []
        this.runs = []

        try {
            const sql = this.sql

            if (runsToFlush.length > 0) {
                await sql`INSERT INTO action_runs ${sql(runsToFlush)}`
            }

            if (logsToFlush.length > 0) {
                await sql`INSERT INTO action_logs ${sql(logsToFlush)}`
            }
        } catch (err) {
            // Put failed entries back, up to max buffer size
            this.runs.unshift(
                ...runsToFlush.slice(0, this.maxBufferSize - this.runs.length),
            )
            this.logs.unshift(
                ...logsToFlush.slice(0, this.maxBufferSize - this.logs.length),
            )

            // Log to stderr so it doesn't recurse through our own logger
            console.error('[bunbase:write-buffer] flush failed:', err)
        } finally {
            this.flushing = false
        }
    }

    /** Graceful shutdown — flush remaining buffer and stop timer */
    async shutdown(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
            this.flushTimer = null
        }
        await this.flush()
    }

    /** Current buffer sizes (for dashboard/diagnostics) */
    get stats(): { logs: number; runs: number } {
        return { logs: this.logs.length, runs: this.runs.length }
    }
}
