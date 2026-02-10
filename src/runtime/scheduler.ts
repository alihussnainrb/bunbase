import { Cron } from 'croner'
import type { ActionRegistry } from '../core/registry.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { executeAction } from './executor.ts'

export class Scheduler {
    private jobs: Cron[] = []

    constructor(
        private readonly registry: ActionRegistry,
        private readonly logger: Logger,
        private readonly writeBuffer: WriteBuffer,
    ) { }

    start(): void {
        this.jobs = []
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
                                    `Error executing cron job for action ${action.definition.config.name}:`,
                                    err,
                                )
                            }
                        })
                        this.jobs.push(job)
                        this.logger.info(
                            `Scheduled cron job for ${action.definition.config.name} (${trigger.schedule})`,
                        )
                    } catch (err) {
                        this.logger.error(
                            `Failed to schedule cron job for ${action.definition.config.name}:`,
                            err,
                        )
                    }
                }
            }
        }
    }

    stop(): void {
        for (const job of this.jobs) {
            job.stop()
        }
        this.jobs = []
    }
}
