/**
 * WebSocket realtime client for Bunbase.
 * Manages connection, auto-reconnect, channel subscriptions, and event listeners.
 */

export type ConnectionState =
	| 'connecting'
	| 'connected'
	| 'disconnected'
	| 'reconnecting'

export interface RealtimeOptions {
	/** WebSocket URL (e.g., ws://localhost:3000/ws) */
	url: string
	/** Auto-reconnect on disconnect (default: true) */
	autoReconnect?: boolean
	/** Max reconnect attempts (default: Infinity) */
	maxReconnectAttempts?: number
	/** Base reconnect delay in ms (default: 1000) */
	reconnectDelay?: number
	/** Max reconnect delay in ms (default: 30000) */
	maxReconnectDelay?: number
	/** Auth token to send as query param (optional) */
	token?: string
}

type EventCallback = (payload: unknown) => void
type StateCallback = (state: ConnectionState) => void

interface ServerMessage {
	type: 'pong' | 'subscribed' | 'unsubscribed' | 'event' | 'error'
	channel?: string
	event?: string
	payload?: unknown
	timestamp?: number
	code?: string
	message?: string
}

export class RealtimeClient {
	private ws: WebSocket | null = null
	private state: ConnectionState = 'disconnected'
	private reconnectAttempts = 0
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private pingTimer: ReturnType<typeof setInterval> | null = null
	private readonly options: Required<
		Pick<
			RealtimeOptions,
			| 'url'
			| 'autoReconnect'
			| 'maxReconnectAttempts'
			| 'reconnectDelay'
			| 'maxReconnectDelay'
		>
	> &
		Pick<RealtimeOptions, 'token'>

	/** channel:event → Set of callbacks */
	private listeners = new Map<string, Set<EventCallback>>()
	/** channel → subscribed flag */
	private subscriptions = new Set<string>()
	/** state change listeners */
	private stateListeners = new Set<StateCallback>()

	constructor(options: RealtimeOptions) {
		this.options = {
			url: options.url,
			autoReconnect: options.autoReconnect ?? true,
			maxReconnectAttempts:
				options.maxReconnectAttempts ?? Number.POSITIVE_INFINITY,
			reconnectDelay: options.reconnectDelay ?? 1000,
			maxReconnectDelay: options.maxReconnectDelay ?? 30000,
			token: options.token,
		}
	}

	/**
	 * Connect to the WebSocket server.
	 */
	connect(): void {
		if (
			this.ws &&
			(this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING)
		) {
			return
		}

		this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

		let url = this.options.url
		if (this.options.token) {
			const separator = url.includes('?') ? '&' : '?'
			url = `${url}${separator}token=${encodeURIComponent(this.options.token)}`
		}

		this.ws = new WebSocket(url)

		this.ws.onopen = () => {
			this.reconnectAttempts = 0
			this.setState('connected')

			// Re-subscribe to all channels
			for (const channel of this.subscriptions) {
				this.sendMessage({ type: 'subscribe', channel })
			}

			// Start ping interval
			this.startPing()
		}

		this.ws.onmessage = (event) => {
			try {
				const msg: ServerMessage = JSON.parse(event.data as string)
				this.handleMessage(msg)
			} catch {
				// Ignore malformed messages
			}
		}

		this.ws.onclose = () => {
			this.stopPing()
			this.setState('disconnected')

			if (
				this.options.autoReconnect &&
				this.reconnectAttempts < this.options.maxReconnectAttempts
			) {
				this.scheduleReconnect()
			}
		}

		this.ws.onerror = () => {
			// onclose will fire after onerror
		}
	}

	/**
	 * Disconnect from the WebSocket server.
	 */
	disconnect(): void {
		this.options.autoReconnect = false
		this.clearReconnectTimer()
		this.stopPing()
		if (this.ws) {
			this.ws.close()
			this.ws = null
		}
		this.setState('disconnected')
	}

	/**
	 * Subscribe to a channel.
	 */
	subscribe(channel: string): void {
		this.subscriptions.add(channel)
		if (this.state === 'connected') {
			this.sendMessage({ type: 'subscribe', channel })
		}
	}

	/**
	 * Unsubscribe from a channel.
	 */
	unsubscribe(channel: string): void {
		this.subscriptions.delete(channel)
		if (this.state === 'connected') {
			this.sendMessage({ type: 'unsubscribe', channel })
		}
		// Remove all listeners for this channel
		for (const key of this.listeners.keys()) {
			if (key.startsWith(`${channel}:`)) {
				this.listeners.delete(key)
			}
		}
	}

	/**
	 * Listen for a specific event on a channel.
	 * Returns an unsubscribe function.
	 */
	on(channel: string, event: string, callback: EventCallback): () => void {
		const key = `${channel}:${event}`
		if (!this.listeners.has(key)) {
			this.listeners.set(key, new Set())
		}
		this.listeners.get(key)!.add(callback)

		return () => {
			const set = this.listeners.get(key)
			if (set) {
				set.delete(callback)
				if (set.size === 0) {
					this.listeners.delete(key)
				}
			}
		}
	}

	/**
	 * Publish an event to a channel.
	 */
	publish(channel: string, event: string, payload?: unknown): void {
		this.sendMessage({ type: 'publish', channel, event, payload })
	}

	/**
	 * Get the current connection state.
	 */
	getState(): ConnectionState {
		return this.state
	}

	/**
	 * Listen for connection state changes.
	 * Returns an unsubscribe function.
	 */
	onStateChange(callback: StateCallback): () => void {
		this.stateListeners.add(callback)
		return () => {
			this.stateListeners.delete(callback)
		}
	}

	/**
	 * Update the auth token (triggers reconnect if connected).
	 */
	setToken(token: string | undefined): void {
		this.options.token = token
		if (this.state === 'connected') {
			// Reconnect with new token
			this.ws?.close()
		}
	}

	private setState(state: ConnectionState): void {
		if (this.state === state) return
		this.state = state
		for (const cb of this.stateListeners) {
			try {
				cb(state)
			} catch {
				// Ignore listener errors
			}
		}
	}

	private handleMessage(msg: ServerMessage): void {
		if (msg.type === 'event' && msg.channel && msg.event) {
			const key = `${msg.channel}:${msg.event}`
			const callbacks = this.listeners.get(key)
			if (callbacks) {
				for (const cb of callbacks) {
					try {
						cb(msg.payload)
					} catch {
						// Ignore listener errors
					}
				}
			}

			// Also fire wildcard listeners for this channel
			const wildcardKey = `${msg.channel}:*`
			const wildcardCallbacks = this.listeners.get(wildcardKey)
			if (wildcardCallbacks) {
				for (const cb of wildcardCallbacks) {
					try {
						cb({ event: msg.event, payload: msg.payload })
					} catch {
						// Ignore listener errors
					}
				}
			}
		}
	}

	private sendMessage(msg: Record<string, unknown>): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg))
		}
	}

	private scheduleReconnect(): void {
		this.clearReconnectTimer()
		const delay = Math.min(
			this.options.reconnectDelay * 2 ** this.reconnectAttempts,
			this.options.maxReconnectDelay,
		)
		this.reconnectAttempts++
		this.reconnectTimer = setTimeout(() => {
			this.connect()
		}, delay)
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
	}

	private startPing(): void {
		this.stopPing()
		this.pingTimer = setInterval(() => {
			this.sendMessage({ type: 'ping' })
		}, 30000)
	}

	private stopPing(): void {
		if (this.pingTimer) {
			clearInterval(this.pingTimer)
			this.pingTimer = null
		}
	}
}
