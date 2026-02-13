import { eventBus } from '../runtime/event-bus.ts'
import type { BunbaseWebSocket } from './types.ts'

/**
 * In-memory channel pub/sub manager.
 * Tracks WebSocket connections and their channel subscriptions.
 */
export class ChannelManager {
	/** channel name → set of subscribed WebSocket connections */
	private channels = new Map<string, Set<BunbaseWebSocket>>()
	/** connectionId → WebSocket reference */
	private connections = new Map<string, BunbaseWebSocket>()

	/**
	 * Register a new WebSocket connection.
	 */
	addConnection(ws: BunbaseWebSocket): void {
		this.connections.set(ws.data.connectionId, ws)
	}

	/**
	 * Remove a WebSocket connection and clean up all its subscriptions.
	 */
	removeConnection(ws: BunbaseWebSocket): void {
		// Unsubscribe from all channels
		for (const channel of ws.data.subscribedChannels) {
			this.unsubscribe(ws, channel)
		}
		this.connections.delete(ws.data.connectionId)
	}

	/**
	 * Subscribe a WebSocket connection to a channel.
	 */
	subscribe(ws: BunbaseWebSocket, channel: string): void {
		if (!this.channels.has(channel)) {
			this.channels.set(channel, new Set())
		}
		this.channels.get(channel)!.add(ws)
		ws.data.subscribedChannels.add(channel)

		// Emit presence event through EventBus
		eventBus.emit(`ws:${channel}:_join`, {
			connectionId: ws.data.connectionId,
			userId: ws.data.userId,
			subscriberCount: this.getSubscriberCount(channel),
		})
	}

	/**
	 * Unsubscribe a WebSocket connection from a channel.
	 */
	unsubscribe(ws: BunbaseWebSocket, channel: string): void {
		const subs = this.channels.get(channel)
		if (subs) {
			subs.delete(ws)
			if (subs.size === 0) {
				this.channels.delete(channel)
			}
		}
		ws.data.subscribedChannels.delete(channel)

		// Emit presence event through EventBus
		eventBus.emit(`ws:${channel}:_leave`, {
			connectionId: ws.data.connectionId,
			userId: ws.data.userId,
			subscriberCount: this.getSubscriberCount(channel),
		})
	}

	/**
	 * Publish a message to all subscribers on a channel.
	 * Also emits through EventBus so action triggers can listen.
	 */
	publish(
		channel: string,
		event: string,
		payload?: unknown,
		excludeConnectionId?: string,
	): void {
		const subs = this.channels.get(channel)
		if (subs) {
			const message = JSON.stringify({ type: 'event', channel, event, payload })
			for (const ws of subs) {
				if (
					excludeConnectionId &&
					ws.data.connectionId === excludeConnectionId
				) {
					continue
				}
				ws.send(message)
			}
		}

		// Also emit through EventBus for action triggers
		eventBus.emit(`ws:${channel}:${event}`, payload)
	}

	/**
	 * Get the number of subscribers on a channel.
	 */
	getSubscriberCount(channel: string): number {
		return this.channels.get(channel)?.size ?? 0
	}

	/**
	 * Get total number of active connections.
	 */
	getConnectionCount(): number {
		return this.connections.size
	}

	/**
	 * Clean up all connections and channels.
	 */
	clear(): void {
		this.channels.clear()
		this.connections.clear()
	}
}
