import type { Server } from 'bun'
import type { SessionManager } from '../auth/session.ts'
import type { Logger } from '../logger/index.ts'
import { ChannelManager } from './channel-manager.ts'
import type {
	BunbaseWebSocket,
	ClientMessage,
	RealtimeConfig,
	WSConnectionData,
} from './types.ts'

/**
 * Handles WebSocket upgrade, message routing, rate limiting, and auth.
 * Creates and owns a ChannelManager internally.
 */
export class WebSocketHandler {
	readonly channelManager: ChannelManager
	private readonly config: RealtimeConfig
	private readonly logger: Logger
	private readonly sessionManager?: SessionManager

	constructor(
		config: RealtimeConfig,
		logger: Logger,
		sessionManager?: SessionManager,
	) {
		this.config = config
		this.logger = logger
		this.sessionManager = sessionManager
		this.channelManager = new ChannelManager()
	}

	/**
	 * Check if this request is a WebSocket upgrade for our path.
	 * Returns true if upgrade was successful.
	 */
	tryUpgrade(req: Request, server: Server<any>): boolean {
		const url = new URL(req.url)
		const wsPath = this.config.path ?? '/ws'

		if (url.pathname !== wsPath) {
			return false
		}

		// Authenticate via session cookie or token query param
		let userId: string | undefined
		if (this.sessionManager) {
			const cookieHeader = req.headers.get('cookie')
			if (cookieHeader) {
				const cookies = parseCookies(cookieHeader)
				const sessionToken = cookies[this.sessionManager.getCookieName()]
				if (sessionToken) {
					const payload = this.sessionManager.verifySession(sessionToken)
					if (payload) {
						userId = payload.userId
					}
				}
			}

			// Fallback: token in query param
			if (!userId) {
				const token = url.searchParams.get('token')
				if (token) {
					const payload = this.sessionManager.verifySession(token)
					if (payload) {
						userId = payload.userId
					}
				}
			}
		}

		const connectionId = generateConnectionId()

		// Cast needed: Bun's Server generic doesn't carry our WSConnectionData type
		const success = (server as any).upgrade(req, {
			data: {
				connectionId,
				userId,
				connectedAt: Date.now(),
				subscribedChannels: new Set<string>(),
			} satisfies WSConnectionData,
		})

		return !!success
	}

	/**
	 * Check if we're at the connection limit.
	 */
	isAtConnectionLimit(req: Request): boolean {
		const url = new URL(req.url)
		const wsPath = this.config.path ?? '/ws'
		if (url.pathname !== wsPath) return false

		const maxConn = this.config.maxConnections ?? 10000
		return this.channelManager.getConnectionCount() >= maxConn
	}

	/**
	 * Returns Bun's websocket handler object for Bun.serve().
	 */
	getHandlers(): {
		open: (ws: BunbaseWebSocket) => void
		message: (ws: BunbaseWebSocket, message: string | Buffer) => void
		close: (ws: BunbaseWebSocket) => void
	} {
		return {
			open: (ws) => this.onOpen(ws),
			message: (ws, message) => this.onMessage(ws, message),
			close: (ws) => this.onClose(ws),
		}
	}

	private onOpen(ws: BunbaseWebSocket): void {
		this.channelManager.addConnection(ws)
		this.logger.debug('WebSocket connected', {
			connectionId: ws.data.connectionId,
			userId: ws.data.userId,
		})
	}

	private onMessage(ws: BunbaseWebSocket, raw: string | Buffer): void {
		const messageStr = typeof raw === 'string' ? raw : raw.toString()

		// Rate limiting per connection
		if (!this.checkRateLimit(ws)) {
			ws.send(
				JSON.stringify({
					type: 'error',
					code: 'RATE_LIMITED',
					message: 'Too many messages',
				}),
			)
			return
		}

		let msg: ClientMessage
		try {
			msg = JSON.parse(messageStr)
		} catch {
			ws.send(
				JSON.stringify({
					type: 'error',
					code: 'INVALID_MESSAGE',
					message: 'Invalid JSON',
				}),
			)
			return
		}

		switch (msg.type) {
			case 'ping':
				ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
				break

			case 'subscribe':
				if (!msg.channel) {
					ws.send(
						JSON.stringify({
							type: 'error',
							code: 'INVALID_MESSAGE',
							message: 'Missing channel name',
						}),
					)
					return
				}
				this.channelManager.subscribe(ws, msg.channel)
				ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }))
				break

			case 'unsubscribe':
				if (!msg.channel) {
					ws.send(
						JSON.stringify({
							type: 'error',
							code: 'INVALID_MESSAGE',
							message: 'Missing channel name',
						}),
					)
					return
				}
				this.channelManager.unsubscribe(ws, msg.channel)
				ws.send(JSON.stringify({ type: 'unsubscribed', channel: msg.channel }))
				break

			case 'publish':
				if (!msg.channel || !msg.event) {
					ws.send(
						JSON.stringify({
							type: 'error',
							code: 'INVALID_MESSAGE',
							message: 'Missing channel or event',
						}),
					)
					return
				}
				// Publish to channel (also triggers EventBus for action listeners)
				this.channelManager.publish(msg.channel, msg.event, msg.payload)
				break

			default:
				ws.send(
					JSON.stringify({
						type: 'error',
						code: 'UNKNOWN_TYPE',
						message: `Unknown message type: ${(msg as any).type}`,
					}),
				)
		}
	}

	private onClose(ws: BunbaseWebSocket): void {
		this.channelManager.removeConnection(ws)
		this.logger.debug('WebSocket disconnected', {
			connectionId: ws.data.connectionId,
		})
	}

	/**
	 * Per-connection rate limiting using sliding window.
	 */
	private checkRateLimit(ws: BunbaseWebSocket): boolean {
		const config = this.config.rateLimit
		if (!config) return true

		const now = Date.now()
		const key = `_rl_${ws.data.connectionId}`

		// Store timestamps on the connection data
		const data = ws.data as any
		if (!data[key]) {
			data[key] = []
		}

		const timestamps: number[] = data[key]
		const windowStart = now - config.windowMs

		// Filter to current window
		const valid = timestamps.filter((t: number) => t > windowStart)

		if (valid.length >= config.maxMessages) {
			return false
		}

		valid.push(now)
		data[key] = valid
		return true
	}

	/**
	 * Clean up all connections.
	 */
	close(): void {
		this.channelManager.clear()
	}
}

function generateConnectionId(): string {
	return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {}
	for (const cookie of cookieHeader.split(';')) {
		const [key, ...valueParts] = cookie.split('=')
		const trimmedKey = key?.trim()
		if (trimmedKey) {
			cookies[trimmedKey] = valueParts.join('=').trim()
		}
	}
	return cookies
}
