import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'

export interface QueueOptions {
    maxRetries?: number
}

export class Queue {
    constructor(
        private readonly db: any,
        private readonly logger: Logger,
        private readonly writeBuffer: WriteBuffer,
    ) { }

    async add(jobName: string, data: unknown, opts?: QueueOptions): Promise<void> {
        // TODO: Implement actual queue persistence
        this.logger.info(`[Queue] Added job ${jobName}`, data)
    }

    async start(): Promise<void> {
        this.logger.info('[Queue] Started worker')
    }

    async stop(): Promise<void> {
        this.logger.info('[Queue] Stopped worker')
    }
}
