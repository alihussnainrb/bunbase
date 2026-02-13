import type { ServerWebSocket } from 'bun'

/**
 * WebSocket message types sent from client to server
 */
export type ClientMessage =
	| { type: 'ping' }
	| { type: 'subscribe'; channel: string }
	| { type: 'unsubscribe'; channel: string }
	| { type: 'publish'; channel: string; event: string; payload?: unknown }

/**
 * WebSocket message types sent from server to client
 */
export type ServerMessage =
	| { type: 'pong'; timestamp: number }
	| { type: 'subscribed'; channel: string }
	| { type: 'unsubscribed'; channel: string }
	| { type: 'event'; channel: string; event: string; payload?: unknown }
	| { type: 'error'; code: string; message: string }

/**
 * Data stored on each WebSocket connection
 */
export interface WSConnectionData {
	connectionId: string
	userId?: string
	connectedAt: number
	subscribedChannels: Set<string>
}

/**
 * Realtime configuration options
 */
export interface RealtimeConfig {
	/** Enable WebSocket realtime support */
	enabled?: boolean
	/** WebSocket endpoint path */
	path?: string
	/** Maximum concurrent WebSocket connections */
	maxConnections?: number
	/** Ping interval in milliseconds */
	pingIntervalMs?: number
	/** Idle timeout in milliseconds */
	idleTimeoutMs?: number
	/** Rate limiting per connection */
	rateLimit?: {
		maxMessages: number
		windowMs: number
	}
	/** Maximum message payload size in bytes */
	maxPayloadLength?: number
}

/**
 * Channel API for publishing messages to WebSocket subscribers
 */
export interface ChannelAPI {
	/**
	 * Publish a message to all subscribers on this channel
	 */
	publish: (event: string, payload?: unknown) => void

	/**
	 * Get the number of active subscribers on this channel
	 */
	subscriberCount: () => number
}

/**
 * Type alias for Bun's ServerWebSocket with our connection data
 */
export type BunbaseWebSocket = ServerWebSocket<WSConnectionData>
