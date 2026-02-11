import type { SQL } from 'bun'
import { Cron } from 'croner'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { executeAction } from './executor.ts'

export interface ScheduledTask {
	id: string
	name: string
	type: 'cron' | 'delayed' | 'once'
	schedule: string | Date | number
	nextRun?: Date
	enabled: boolean
}

type ScheduleTime = number | Date | string

/**
 * Scheduler for time-based task execution.
 * Handles cron-triggered actions and delayed/scheduled tasks via ctx.schedule()
 */
export class Scheduler {
	private cronJobs: Cron[] = []
	private delayedTasks = new Map<
		string,
		{ timeout: ReturnType<typeof setTimeout>; handler: () => void }
	>()
	private running = false

	constructor(
		private readonly registry: ActionRegistry,
		private readonly logger: Logger,
		private readonly writeBuffer: WriteBuffer,
		private readonly sql: SQL,
	) {}

	/**
	 * Schedule a task to run at a specific time.
	 * - number: delay in seconds from now
	 * - Date: specific date/time to execute
	 * - string: cron pattern for recurring execution
	 */
	async schedule(
		time: ScheduleTime,
		name: string,
		handler: () => Promise<void>,
	): Promise<string> {
		const id = crypto.randomUUID()

		if (typeof time === 'number') {
			// Delay in seconds
			const delayMs = time * 1000
			const timeout = setTimeout(async () => {
				try {
					await handler()
				} catch (err) {
					this.logger.error(`[Scheduler] Delayed task ${name} failed:`, err)
				}
				this.delayedTasks.delete(id)
			}, delayMs)

			this.delayedTasks.set(id, { timeout, handler })
			this.logger.info(`[Scheduler] Scheduled ${name} in ${time}s`, {
				taskId: id,
			})
		} else if (time instanceof Date) {
			// Specific date
			const delayMs = time.getTime() - Date.now()
			if (delayMs < 0) {
				throw new Error('Cannot schedule task in the past')
			}

			const timeout = setTimeout(async () => {
				try {
					await handler()
				} catch (err) {
					this.logger.error(`[Scheduler] Scheduled task ${name} failed:`, err)
				}
				this.delayedTasks.delete(id)
			}, delayMs)

			this.delayedTasks.set(id, { timeout, handler })
			this.logger.info(
				`[Scheduler] Scheduled ${name} at ${time.toISOString()}`,
				{ taskId: id },
			)
		} else if (typeof time === 'string') {
			// Cron pattern - creates recurring job
			const job = new Cron(time, async () => {
				try {
					await handler()
				} catch (err) {
					this.logger.error(`[Scheduler] Cron task ${name} failed:`, err)
				}
			})

			this.cronJobs.push(job)
			this.logger.info(`[Scheduler] Scheduled cron ${name}: ${time}`, {
				taskId: id,
			})
		}

		return id
	}

	/**
	 * Cancel a scheduled/delayed task.
	 */
	cancel(taskId: string): boolean {
		// Check delayed tasks
		const delayed = this.delayedTasks.get(taskId)
		if (delayed) {
			clearTimeout(delayed.timeout)
			this.delayedTasks.delete(taskId)
			this.logger.info(`[Scheduler] Cancelled delayed task`, { taskId })
			return true
		}

		return false
	}

	/**
	 * Start cron-triggered actions from registry.
	 */
	start(): void {
		if (this.running) return
		this.running = true

		// Start cron-triggered actions
		for (const action of this.registry.getAll()) {
			for (const trigger of action.triggers) {
				if (trigger.type === 'cron') {
					try {
						const job = new Cron(trigger.schedule, async () => {
							try {
								const input = trigger.input ? trigger.input() : {}
								await executeAction(action, input, {
									triggerType: 'cron',
									logger: this.logger,
									writeBuffer: this.writeBuffer,
								})
							} catch (err) {
								this.logger.error(
									`Error executing cron action ${action.definition.config.name}:`,
									err,
								)
							}
						})
						this.cronJobs.push(job)
						this.logger.info(
							`[Scheduler] Cron action: ${action.definition.config.name} (${trigger.schedule})`,
						)
					} catch (err) {
						this.logger.error(
							`Failed to schedule cron action ${action.definition.config.name}:`,
							err,
						)
					}
				}
			}
		}

		this.logger.info('[Scheduler] Started')
	}

	/**
	 * Stop all scheduled tasks.
	 */
	stop(): void {
		this.running = false

		// Stop cron jobs
		for (const job of this.cronJobs) {
			job.stop()
		}
		this.cronJobs = []

		// Cancel delayed tasks
		for (const [id, task] of this.delayedTasks) {
			clearTimeout(task.timeout)
		}
		this.delayedTasks.clear()

		this.logger.info('[Scheduler] Stopped')
	}

	/**
	 * List all scheduled tasks.
	 */
	listTasks(): ScheduledTask[] {
		const tasks: ScheduledTask[] = []

		// Add cron jobs
		for (const job of this.cronJobs) {
			tasks.push({
				id: crypto.randomUUID(),
				name: 'cron-action',
				type: 'cron',
				schedule: job.getPattern() || 'unknown',
				nextRun: job.nextRun() || undefined,
				enabled: true,
			})
		}

		// Add delayed tasks
		for (const [id, task] of this.delayedTasks) {
			tasks.push({
				id,
				name: 'delayed-task',
				type: 'delayed',
				schedule: 'once',
				enabled: true,
			})
		}

		return tasks
	}
}
