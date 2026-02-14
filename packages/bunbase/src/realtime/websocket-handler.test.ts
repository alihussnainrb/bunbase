import { beforeEach, describe, expect, it } from 'bun:test'
import type { WSConnectionData } from './types.ts'
import { WebSocketHandler } from './websocket-handler.ts'

function createMockLogger() {
	return {
		info: () => {},
		error: () => {},
		debug: () => {},
		warn: () => {},
		child: function (this: any) {
			return this
		},
	} as any
}

function createMockWS(connectionId: string, userId?: string) {
	const sent: string[] = []
	return {
		data: {
			connectionId,
			userId,
			connectedAt: Date.now(),
			subscribedChannels: new Set<string>(),
		} satisfies WSConnectionData,
		send: (msg: string) => {
			sent.push(msg)
		},
		close: () => {},
		_sent: sent,
	} as any
}

describe('WebSocketHandler', () => {
	let handler: WebSocketHandler

	beforeEach(() => {
		handler = new WebSocketHandler(
			{
				enabled: true,
				path: '/ws',
				maxConnections: 100,
			},
			createMockLogger(),
		)
	})

	describe('constructor', () => {
		it('should create a ChannelManager', () => {
			expect(handler.channelManager).toBeDefined()
			expect(handler.channelManager.getConnectionCount()).toBe(0)
		})
	})

	describe('getHandlers', () => {
		it('should return open, message, and close handlers', () => {
			const handlers = handler.getHandlers()
			expect(typeof handlers.open).toBe('function')
			expect(typeof handlers.message).toBe('function')
			expect(typeof handlers.close).toBe('function')
		})
	})

	describe('message handling', () => {
		it('should handle ping messages', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(ws, JSON.stringify({ type: 'ping' }))

			expect(ws._sent.length).toBe(1)
			const response = JSON.parse(ws._sent[0])
			expect(response.type).toBe('pong')
			expect(response.timestamp).toBeGreaterThan(0)
		})

		it('should handle subscribe messages', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(
				ws,
				JSON.stringify({ type: 'subscribe', channel: 'chat:general' }),
			)

			expect(ws._sent.length).toBe(1)
			const response = JSON.parse(ws._sent[0])
			expect(response.type).toBe('subscribed')
			expect(response.channel).toBe('chat:general')
			expect(handler.channelManager.getSubscriberCount('chat:general')).toBe(1)
		})

		it('should handle unsubscribe messages', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(
				ws,
				JSON.stringify({ type: 'subscribe', channel: 'chat:general' }),
			)
			handlers.message(
				ws,
				JSON.stringify({ type: 'unsubscribe', channel: 'chat:general' }),
			)

			expect(ws._sent.length).toBe(2)
			const response = JSON.parse(ws._sent[1])
			expect(response.type).toBe('unsubscribed')
			expect(response.channel).toBe('chat:general')
			expect(handler.channelManager.getSubscriberCount('chat:general')).toBe(0)
		})

		it('should handle publish messages', () => {
			const handlers = handler.getHandlers()
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')

			handlers.open(ws1)
			handlers.open(ws2)

			// Both subscribe to same channel
			handlers.message(
				ws1,
				JSON.stringify({ type: 'subscribe', channel: 'chat:general' }),
			)
			handlers.message(
				ws2,
				JSON.stringify({ type: 'subscribe', channel: 'chat:general' }),
			)

			// ws1 publishes
			handlers.message(
				ws1,
				JSON.stringify({
					type: 'publish',
					channel: 'chat:general',
					event: 'message',
					payload: { text: 'Hello' },
				}),
			)

			// Both should receive the event (publish broadcasts to all subscribers including sender)
			const ws1Events = ws1._sent.filter(
				(m: string) => JSON.parse(m).type === 'event',
			)
			const ws2Events = ws2._sent.filter(
				(m: string) => JSON.parse(m).type === 'event',
			)

			expect(ws1Events.length).toBe(1)
			expect(ws2Events.length).toBe(1)

			const event = JSON.parse(ws2Events[0])
			expect(event.channel).toBe('chat:general')
			expect(event.event).toBe('message')
			expect(event.payload).toEqual({ text: 'Hello' })
		})

		it('should send error for invalid JSON', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(ws, 'not json')

			expect(ws._sent.length).toBe(1)
			const response = JSON.parse(ws._sent[0])
			expect(response.type).toBe('error')
			expect(response.code).toBe('INVALID_MESSAGE')
		})

		it('should send error for subscribe without channel', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(ws, JSON.stringify({ type: 'subscribe' }))

			expect(ws._sent.length).toBe(1)
			const response = JSON.parse(ws._sent[0])
			expect(response.type).toBe('error')
			expect(response.code).toBe('INVALID_MESSAGE')
		})

		it('should send error for publish without channel or event', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(ws, JSON.stringify({ type: 'publish', channel: 'chat' }))

			const response = JSON.parse(ws._sent[0])
			expect(response.type).toBe('error')
		})

		it('should send error for unknown message type', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(ws, JSON.stringify({ type: 'unknown_type' }))

			const response = JSON.parse(ws._sent[0])
			expect(response.type).toBe('error')
			expect(response.code).toBe('UNKNOWN_TYPE')
		})
	})

	describe('connection lifecycle', () => {
		it('should track connections on open', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			expect(handler.channelManager.getConnectionCount()).toBe(1)
		})

		it('should clean up on close', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')

			handlers.open(ws)
			handlers.message(
				ws,
				JSON.stringify({ type: 'subscribe', channel: 'chat:general' }),
			)

			handlers.close(ws)
			expect(handler.channelManager.getConnectionCount()).toBe(0)
			expect(handler.channelManager.getSubscriberCount('chat:general')).toBe(0)
		})
	})

	describe('rate limiting', () => {
		it('should enforce rate limits when configured', () => {
			const rateLimitedHandler = new WebSocketHandler(
				{
					enabled: true,
					path: '/ws',
					rateLimit: {
						maxMessages: 3,
						windowMs: 10000,
					},
				},
				createMockLogger(),
			)

			const handlers = rateLimitedHandler.getHandlers()
			const ws = createMockWS('conn-1')
			handlers.open(ws)

			// Send 3 messages (within limit)
			for (let i = 0; i < 3; i++) {
				handlers.message(ws, JSON.stringify({ type: 'ping' }))
			}

			// 3 pong responses
			const pongs = ws._sent.filter(
				(m: string) => JSON.parse(m).type === 'pong',
			)
			expect(pongs.length).toBe(3)

			// 4th message should be rate limited
			handlers.message(ws, JSON.stringify({ type: 'ping' }))

			const errors = ws._sent.filter(
				(m: string) => JSON.parse(m).type === 'error',
			)
			expect(errors.length).toBe(1)
			expect(JSON.parse(errors[0]).code).toBe('RATE_LIMITED')
		})

		it('should not rate limit when not configured', () => {
			const handlers = handler.getHandlers()
			const ws = createMockWS('conn-1')
			handlers.open(ws)

			// Send many messages without rate limiting
			for (let i = 0; i < 50; i++) {
				handlers.message(ws, JSON.stringify({ type: 'ping' }))
			}

			const pongs = ws._sent.filter(
				(m: string) => JSON.parse(m).type === 'pong',
			)
			expect(pongs.length).toBe(50)
		})
	})

	describe('isAtConnectionLimit', () => {
		it('should return false when under limit', () => {
			const req = new Request('http://localhost:3000/ws')
			expect(handler.isAtConnectionLimit(req)).toBe(false)
		})

		it('should return false for non-ws paths', () => {
			const req = new Request('http://localhost:3000/api/test')
			expect(handler.isAtConnectionLimit(req)).toBe(false)
		})

		it('should return true when at limit', () => {
			const limitedHandler = new WebSocketHandler(
				{
					enabled: true,
					path: '/ws',
					maxConnections: 2,
				},
				createMockLogger(),
			)

			const handlers = limitedHandler.getHandlers()

			// Add connections up to the limit
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			handlers.open(ws1)
			handlers.open(ws2)

			const req = new Request('http://localhost:3000/ws')
			expect(limitedHandler.isAtConnectionLimit(req)).toBe(true)
		})
	})

	describe('close', () => {
		it('should clear all connections', () => {
			const handlers = handler.getHandlers()
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')

			handlers.open(ws1)
			handlers.open(ws2)
			handlers.message(
				ws1,
				JSON.stringify({ type: 'subscribe', channel: 'room:1' }),
			)

			handler.close()

			expect(handler.channelManager.getConnectionCount()).toBe(0)
			expect(handler.channelManager.getSubscriberCount('room:1')).toBe(0)
		})
	})
})
