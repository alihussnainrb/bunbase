import type { SQL } from 'bun'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'

export interface QueueOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number
	/** Job priority - higher runs first (default: 0) */
	priority?: number
	/** Schedule job to run at a specific time (default: now) */
	runAt?: Date
}

export interface Job {
	id: string
	name: string
	data: unknown
	status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying'
	priority: number
	attempts: number
	maxAttempts: number
	runAt: Date
	lastError?: string
	traceId?: string
	createdAt: Date
	updatedAt: Date
}

export interface JobContext {
	/** Unique job ID */
	jobId: string
	/** Trace ID for correlation */
	traceId: string
	/** Logger scoped to this job */
	logger: Logger
	/** SQL client for database access */
	sql: SQL
	/** Current attempt number (1-indexed) */
	attempt: number
}

export type JobHandler = (data: unknown, ctx: JobContext) => Promise<void>

/**
 * Postgres-backed job queue with polling-based workers.
 * Supports priorities, delayed jobs, retries, and dead letter queue.
 */
export class Queue {
	private running = false
	private readonly pollIntervalMs: number
	private pollTimer: ReturnType<typeof setInterval> | null = null
	private handlers = new Map<string, JobHandler>()
	private processingJobs = new Set<string>()

	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
		readonly _writeBuffer: WriteBuffer,
		opts: { pollIntervalMs?: number } = {},
	) {
		this.pollIntervalMs = opts.pollIntervalMs ?? 1000
	}

	/**
	 * Register a job handler for a specific job name.
	 * Must be called before starting the queue worker.
	 */
	register(name: string, handler: JobHandler): void {
		if (this.handlers.has(name)) {
			throw new Error(`Job handler already registered: ${name}`)
		}
		this.handlers.set(name, handler)
		this.logger.debug(`[Queue] Registered handler for ${name}`)
	}

	/**
	 * Add/push a job to the queue (FIFO).
	 */
	async add(name: string, data: unknown, opts?: QueueOptions): Promise<string> {
		return this.push(name, data, opts)
	}

	async push(
		name: string,
		data: unknown,
		opts?: QueueOptions,
	): Promise<string> {
		const maxAttempts = (opts?.maxRetries ?? 3) + 1
		const priority = opts?.priority ?? 0
		const runAt = opts?.runAt ?? new Date()
		const id = crypto.randomUUID()

		await this.sql`
            INSERT INTO job_queue (id, name, data, priority, max_attempts, run_at, status)
            VALUES (${id}, ${name}, ${JSON.stringify(data)}, ${priority}, ${maxAttempts}, ${runAt}, 'pending')
        `

		this.logger.info(`[Queue] Added job ${name}`, { jobId: id, runAt })
		return id
	}

	/**
	 * Get a job by ID.
	 */
	async get(jobId: string): Promise<Job | null> {
		const [row] = await this.sql`
            SELECT id, name, data, status, priority, attempts, max_attempts, run_at, last_error, trace_id, created_at, updated_at
            FROM job_queue
            WHERE id = ${jobId}
        `
		return row ? this.rowToJob(row) : null
	}

	/**
	 * Get all jobs with optional filtering.
	 */
	async getAll(
		opts: {
			status?: Job['status']
			name?: string
			limit?: number
			offset?: number
		} = {},
	): Promise<Job[]> {
		return this.listJobs(opts)
	}

	/**
	 * Update a job's data or priority.
	 */
	async update(
		jobId: string,
		updates: { data?: unknown; priority?: number },
	): Promise<boolean> {
		if (updates.data !== undefined) {
			await this
				.sql`UPDATE job_queue SET data = ${JSON.stringify(updates.data)} WHERE id = ${jobId}`
		}
		if (updates.priority !== undefined) {
			await this
				.sql`UPDATE job_queue SET priority = ${updates.priority} WHERE id = ${jobId}`
		}
		await this.sql`UPDATE job_queue SET updated_at = NOW() WHERE id = ${jobId}`
		return true
	}

	/**
	 * Delete/remove a pending job.
	 */
	async delete(jobId: string): Promise<boolean> {
		const result = await this.sql`
            DELETE FROM job_queue
            WHERE id = ${jobId} AND status = 'pending'
        `
		return result.count > 0
	}

	async remove(jobId: string): Promise<boolean> {
		return this.delete(jobId)
	}

	/**
	 * Start the queue worker polling loop.
	 */
	async start(): Promise<void> {
		if (this.running) {
			throw new Error('Queue is already running')
		}

		this.running = true
		this.logger.info('[Queue] Started worker', {
			pollIntervalMs: this.pollIntervalMs,
		})

		// Do an immediate poll
		await this.poll()

		// Start polling loop
		this.pollTimer = setInterval(() => {
			void this.poll()
		}, this.pollIntervalMs)
	}

	/**
	 * Stop the queue worker gracefully.
	 */
	async stop(): Promise<void> {
		this.running = false

		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}

		// Wait for in-flight jobs to complete (with timeout)
		const timeout = 5000
		const start = Date.now()
		while (this.processingJobs.size > 0 && Date.now() - start < timeout) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}

		this.logger.info('[Queue] Stopped worker', {
			pendingJobs: this.processingJobs.size,
		})
	}

	/**
	 * Poll for pending jobs and execute them.
	 */
	private async poll(): Promise<void> {
		if (!this.running) return

		try {
			// Atomically fetch and claim next pending job in a transaction
			// This ensures FOR UPDATE lock is held while transitioning to running
			const job = await this.sql.begin(async (tx: any) => {
				// Fetch next pending job with row lock
				const jobs = await tx`
                    SELECT id, name, data, status, priority, attempts, max_attempts, run_at, last_error, trace_id, created_at, updated_at
                    FROM job_queue
                    WHERE status IN ('pending', 'retrying')
                        AND run_at <= NOW()
                    ORDER BY priority DESC, run_at ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                `

				if (jobs.length === 0) return null

				const job = this.rowToJob(jobs[0])

				// Skip if already processing this job (in-memory check)
				if (this.processingJobs.has(job.id)) return null

				// Atomically mark as running within same transaction (lock still held)
				await tx`
                    UPDATE job_queue
                    SET status = 'running', attempts = attempts + 1
                    WHERE id = ${job.id}
                `

				return job
			})

			if (!job) return

			// Check if handler exists
			const handler = this.handlers.get(job.name)
			if (!handler) {
				await this.markFailed(
					job.id,
					`No handler registered for job: ${job.name}`,
				)
				return
			}

			// Execute the job (now safely claimed)
			await this.executeJobHandler(job, handler)
		} catch (err) {
			this.logger.error('[Queue] Poll error:', err)
		}
	}

	/**
	 * Execute a single job with error handling and retries.
	 * Job is already marked as 'running' by poll() transaction.
	 */
	private async executeJobHandler(job: Job, handler: JobHandler): Promise<void> {
		this.processingJobs.add(job.id)

		try {
			this.logger.info(`[Queue] Executing job ${job.name}`, {
				jobId: job.id,
				attempt: job.attempts + 1,
				traceId: job.traceId,
			})

			// Create job context
			const jobLogger = this.logger.child({
				job: job.name,
				jobId: job.id,
				traceId: job.traceId,
			})

			const ctx: JobContext = {
				jobId: job.id,
				traceId: job.traceId || this.generateTraceId(),
				logger: jobLogger,
				sql: this.sql,
				attempt: job.attempts + 1,
			}

			// Execute handler
			await handler(job.data, ctx)

			// Mark as completed
			await this.sql`
                UPDATE job_queue
                SET status = 'completed'
                WHERE id = ${job.id}
            `

			this.logger.info(`[Queue] Completed job ${job.name}`, { jobId: job.id })
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			this.logger.error(`[Queue] Job ${job.name} failed:`, {
				jobId: job.id,
				error: errorMessage,
			})

			// Check if we should retry
			if (job.attempts + 1 >= job.maxAttempts) {
				// Move to dead letter queue
				await this.moveToDeadLetter(job, errorMessage)
			} else {
				// Schedule retry with exponential backoff
				const backoffMs = Math.min(1000 * 2 ** job.attempts, 30000)
				const retryAt = new Date(Date.now() + backoffMs)

				await this.sql`
                    UPDATE job_queue
                    SET status = 'retrying', last_error = ${errorMessage}, run_at = ${retryAt}
                    WHERE id = ${job.id}
                `

				this.logger.info(`[Queue] Scheduled retry for ${job.name}`, {
					jobId: job.id,
					attempt: job.attempts + 1,
					retryAt,
				})
			}
		} finally {
			this.processingJobs.delete(job.id)
		}
	}

	/**
	 * Mark a job as permanently failed.
	 */
	private async markFailed(jobId: string, error: string): Promise<void> {
		await this.sql`
            UPDATE job_queue
            SET status = 'failed', last_error = ${error}
            WHERE id = ${jobId}
        `
	}

	/**
	 * Move a job to the dead letter queue.
	 */
	private async moveToDeadLetter(job: Job, error: string): Promise<void> {
		// Insert into dead letter queue
		await this.sql`
            INSERT INTO job_failures (id, name, data, error, attempts, failed_at, trace_id)
            VALUES (${job.id}, ${job.name}, ${JSON.stringify(job.data)}, ${error}, ${job.attempts + 1}, NOW(), ${job.traceId})
        `

		// Remove from main queue
		await this.sql`DELETE FROM job_queue WHERE id = ${job.id}`

		this.logger.error(`[Queue] Job ${job.name} moved to dead letter queue`, {
			jobId: job.id,
			attempts: job.attempts + 1,
		})
	}

	/**
	 * Retry a failed job from the dead letter queue.
	 */
	async retryFailedJob(jobId: string): Promise<string | null> {
		// Get from dead letter queue
		const [failed] = await this.sql`
            SELECT id, name, data, trace_id
            FROM job_failures
            WHERE id = ${jobId}
        `

		if (!failed) return null

		// Remove from dead letter queue
		await this.sql`DELETE FROM job_failures WHERE id = ${jobId}`

		// Re-add to main queue with reset attempts
		const [result] = await this.sql`
            INSERT INTO job_queue (id, name, data, status, priority, max_attempts, trace_id)
            VALUES (${failed.id}, ${failed.name}, ${failed.data}, 'pending', 0, 3, ${failed.trace_id})
            RETURNING id
        `

		this.logger.info(
			`[Queue] Retried job ${failed.name} from dead letter queue`,
			{ jobId: result.id },
		)
		return result.id
	}

	/**
	 * Get queue statistics for dashboard.
	 */
	async getStats(): Promise<{
		pending: number
		running: number
		completed: number
		failed: number
		deadLetter: number
	}> {
		const [stats] = await this.sql`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'running') as running,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM job_queue
        `

		const [deadStats] = await this
			.sql`SELECT COUNT(*) as count FROM job_failures`

		return {
			pending: parseInt(stats.pending, 10),
			running: parseInt(stats.running, 10),
			completed: parseInt(stats.completed, 10),
			failed: parseInt(stats.failed, 10),
			deadLetter: parseInt(deadStats.count, 10),
		}
	}

	/**
	 * List jobs with optional filtering.
	 */
	async listJobs(
		opts: {
			status?: Job['status']
			name?: string
			limit?: number
			offset?: number
		} = {},
	): Promise<Job[]> {
		const limit = opts.limit ?? 50
		const offset = opts.offset ?? 0

		let query = this.sql`
            SELECT id, name, data, status, priority, attempts, max_attempts, run_at, last_error, trace_id, created_at, updated_at
            FROM job_queue
            WHERE 1=1
        `

		if (opts.status) {
			query = this.sql`${query} AND status = ${opts.status}`
		}

		if (opts.name) {
			query = this.sql`${query} AND name = ${opts.name}`
		}

		query = this
			.sql`${query} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`

		const rows = await query
		return rows.map((r: any) => this.rowToJob(r))
	}

	/**
	 * List dead letter jobs.
	 */
	async listDeadLetter(opts: { limit?: number; offset?: number } = {}): Promise<
		Array<{
			id: string
			name: string
			data: unknown
			error: string
			attempts: number
			failedAt: Date
			traceId?: string
		}>
	> {
		const limit = opts.limit ?? 50
		const offset = opts.offset ?? 0

		const rows = await this.sql`
            SELECT id, name, data, error, attempts, failed_at, trace_id
            FROM job_failures
            ORDER BY failed_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `

		return rows.map((r: any) => ({
			id: r.id,
			name: r.name,
			data: r.data,
			error: r.error,
			attempts: r.attempts,
			failedAt: r.failed_at,
			traceId: r.trace_id,
		}))
	}

	/**
	 * Convert database row to Job object.
	 */
	private rowToJob(row: any): Job {
		return {
			id: row.id,
			name: row.name,
			data: row.data,
			status: row.status,
			priority: row.priority,
			attempts: row.attempts,
			maxAttempts: row.max_attempts,
			runAt: new Date(row.run_at),
			lastError: row.last_error,
			traceId: row.trace_id,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
		}
	}

	/**
	 * Generate a unique trace ID.
	 */
	private generateTraceId(): string {
		return crypto.randomUUID()
	}
}
