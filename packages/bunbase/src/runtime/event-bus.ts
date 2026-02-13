import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

export type EventHandler = (payload: unknown) => void | Promise<void>

export class EventBus {
	private emitter = new EventEmitter()
	private redis: import('bun').RedisClient | null = null
	private subscriber: import('bun').RedisClient | null = null
	private instanceId = randomUUID()

	constructor() {
		this.emitter.setMaxListeners(50) // Increase limit for many actions
	}

	/**
	 * Attach a Redis client for distributed event propagation.
	 * Creates a dedicated subscriber connection for Pub/Sub.
	 * Events emitted locally are also published to Redis so other
	 * Bunbase instances receive them.
	 */
	async attachRedis(redis: import('bun').RedisClient): Promise<void> {
		this.redis = redis
		// Create a separate subscriber connection (Redis requires dedicated
		// connections for SUBSCRIBE — they can't be reused for other commands)
		this.subscriber = await redis.duplicate()

		// Subscribe to the bunbase events channel
		await this.subscriber!.subscribe('bunbase:events', (message: string) => {
			try {
				const parsed = JSON.parse(message)
				// Skip events that originated from this instance
				if (parsed.origin === this.instanceId) return
				// Emit remotely-received events into the local EventEmitter
				this.emitter.emit(parsed.name, parsed.payload)
			} catch {
				// Ignore malformed messages
			}
		})
	}

	/**
	 * Detach Redis and clean up the subscriber connection.
	 */
	async detach(): Promise<void> {
		if (this.subscriber) {
			await this.subscriber.unsubscribe('bunbase:events')
			this.subscriber.close()
			this.subscriber = null
		}
		this.redis = null
	}

	emit(name: string, payload?: unknown): void {
		// Always emit locally
		this.emitter.emit(name, payload)

		// Publish to Redis for cross-instance propagation
		if (this.redis) {
			const message = JSON.stringify({
				origin: this.instanceId,
				name,
				payload,
			})
			this.redis.publish('bunbase:events', message).catch(() => {
				// Silently ignore publish failures — local emit still works
			})
		}
	}

	on(name: string, handler: EventHandler): void {
		this.emitter.on(name, async (payload) => {
			try {
				await handler(payload)
			} catch (err) {
				console.error(`[EventBus] Error handling event ${name}:`, err)
			}
		})
	}

	off(name: string, handler: EventHandler): void {
		this.emitter.off(name, handler)
	}
}

// Singleton instance
export const eventBus: EventBus = new EventBus()
