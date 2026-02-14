import type { RedisClient, SQL } from 'bun'
import { Cron } from 'croner'
import type { BunbaseConfig } from '../config/types.ts'
import type { ActionRegistry } from '../core/registry.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { withLock } from './distributed-lock.ts'
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
	private cronJobsByAction = new Map<string, { job: Cron; trigger: any }>()
	private delayedTasks = new Map<
		string,
		{ timeout: ReturnType<typeof setTimeout>; handler: () => void }
	>()
	private running = false

	constructor(
		private readonly registry: ActionRegistry,
		private readonly logger: Logger,
		private readonly writeBuffer: WriteBuffer,
		readonly _sql: SQL,
		private readonly config: BunbaseConfig | undefined = undefined,
		private readonly redis: RedisClient | undefined = undefined,
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
								const actionName = action.definition.config.name

								// Use distributed lock when Redis is available
								if (this.redis) {
									const lockKey = `bunbase:cron:${actionName}`
									const lockTTL = 300 // 5 minutes - adjust based on expected job duration

									const result = await withLock(
										this.redis,
										lockKey,
										lockTTL,
										async () => {
											return executeAction(action, input, {
												triggerType: 'cron',
												logger: this.logger,
												writeBuffer: this.writeBuffer,
												config: this.config,
											})
										},
									)

									if (result === null) {
										this.logger.debug(
											`Skipped cron job ${actionName} (held by another instance)`,
										)
										return
									}

									// Handle cron transport metadata
									if (result.success && result.transportMeta?.cron) {
										const cronMeta = result.transportMeta.cron

										// Dynamic rescheduling
										if (cronMeta.reschedule) {
											this.rescheduleAction(actionName, cronMeta.reschedule, trigger)
										}

										// One-time execution
										if (cronMeta.runOnce) {
											this.stopAction(actionName)
										}

										// Skip next run
										if (cronMeta.skipNext) {
											this.logger.info(
												`[Scheduler] skipNext requested for ${actionName} (not supported by croner)`,
											)
										}
									}
								} else {
									// Single-instance mode (no Redis)
									const result = await executeAction(action, input, {
										triggerType: 'cron',
										logger: this.logger,
										writeBuffer: this.writeBuffer,
										config: this.config,
									})

									// Handle cron transport metadata
									if (result.success && result.transportMeta?.cron) {
										const cronMeta = result.transportMeta.cron

										// Dynamic rescheduling
										if (cronMeta.reschedule) {
											this.rescheduleAction(actionName, cronMeta.reschedule, trigger)
										}

										// One-time execution
										if (cronMeta.runOnce) {
											this.stopAction(actionName)
										}

										// Skip next run
										if (cronMeta.skipNext) {
											this.logger.info(
												`[Scheduler] skipNext requested for ${actionName} (not supported by croner)`,
											)
										}
									}
								}
							} catch (err) {
								this.logger.error(
									`Error executing cron action ${action.registryKey}:`,
									err,
								)
							}
						})

						// Store job reference for dynamic management
						this.cronJobsByAction.set(action.registryKey, {
							job,
							trigger,
						})
						this.cronJobs.push(job)
						this.logger.info(
							`[Scheduler] Cron action: ${action.registryKey} (${trigger.schedule})`,
						)
					} catch (err) {
						this.logger.error(
							`Failed to schedule cron action ${action.registryKey}:`,
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
		for (const [_id, task] of this.delayedTasks) {
			clearTimeout(task.timeout)
		}
		this.delayedTasks.clear()

		this.logger.info('[Scheduler] Stopped')
	}

	/**
	 * Reschedule a cron action with a new schedule pattern.
	 */
	private rescheduleAction(
		actionName: string,
		newSchedule: string,
		trigger: any,
	): void {
		const existing = this.cronJobsByAction.get(actionName)
		if (!existing) {
			this.logger.warn(`[Scheduler] Cannot reschedule ${actionName}: not found`)
			return
		}

		// Stop old job
		existing.job.stop()

		// Remove from cronJobs array
		const index = this.cronJobs.indexOf(existing.job)
		if (index > -1) {
			this.cronJobs.splice(index, 1)
		}

		// Create new job with updated schedule
		try {
			const action = this.registry.get(actionName)
			if (!action) {
				this.logger.error(
					`[Scheduler] Cannot reschedule ${actionName}: action not found in registry`,
				)
				return
			}

			const newJob = new Cron(newSchedule, async () => {
				try {
					const input = trigger.input ? trigger.input() : {}
					const result = await executeAction(action, input, {
						triggerType: 'cron',
						logger: this.logger,
						writeBuffer: this.writeBuffer,
						config: this.config,
					})

					// Handle metadata recursively
					if (result.success && result.transportMeta?.cron) {
						const cronMeta = result.transportMeta.cron
						if (cronMeta.reschedule) {
							this.rescheduleAction(actionName, cronMeta.reschedule, trigger)
						}
						if (cronMeta.runOnce) {
							this.stopAction(actionName)
						}
					}
				} catch (err) {
					this.logger.error(`Error executing cron action ${actionName}:`, err)
				}
			})

			// Update references
			this.cronJobsByAction.set(actionName, { job: newJob, trigger })
			this.cronJobs.push(newJob)

			this.logger.info(
				`[Scheduler] Rescheduled ${actionName} to: ${newSchedule}`,
			)
		} catch (err) {
			this.logger.error(`[Scheduler] Failed to reschedule ${actionName}:`, err)
		}
	}

	/**
	 * Stop a specific cron action.
	 */
	private stopAction(actionName: string): void {
		const existing = this.cronJobsByAction.get(actionName)
		if (!existing) {
			this.logger.warn(`[Scheduler] Cannot stop ${actionName}: not found`)
			return
		}

		// Stop job
		existing.job.stop()

		// Remove from cronJobs array
		const index = this.cronJobs.indexOf(existing.job)
		if (index > -1) {
			this.cronJobs.splice(index, 1)
		}

		// Remove from map
		this.cronJobsByAction.delete(actionName)

		this.logger.info(`[Scheduler] Stopped cron action: ${actionName}`)
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
			this.logger.info(`[Scheduler] Delayed task: ${id}`, { task })
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
