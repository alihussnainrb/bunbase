import { EventEmitter } from 'node:events'

export type EventHandler = (payload: unknown) => void | Promise<void>

export class EventBus {
	private emitter = new EventEmitter()

	constructor() {
		this.emitter.setMaxListeners(50) // Increase limit for many actions
	}

	emit(name: string, payload?: unknown): void {
		this.emitter.emit(name, payload)
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
