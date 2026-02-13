import { describe, expect, it, beforeEach, mock } from 'bun:test'
import { ChannelManager } from './channel-manager.ts'
import type { BunbaseWebSocket, WSConnectionData } from './types.ts'

function createMockWS(
	connectionId: string,
	userId?: string,
): BunbaseWebSocket {
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
		// Expose sent messages for assertions
		_sent: sent,
	} as any
}

describe('ChannelManager', () => {
	let manager: ChannelManager

	beforeEach(() => {
		manager = new ChannelManager()
	})

	describe('addConnection / removeConnection', () => {
		it('should track connections', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			expect(manager.getConnectionCount()).toBe(1)
		})

		it('should remove connections', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			manager.removeConnection(ws)
			expect(manager.getConnectionCount()).toBe(0)
		})

		it('should clean up subscriptions on disconnect', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			manager.subscribe(ws, 'chat:general')
			manager.subscribe(ws, 'chat:private')

			expect(manager.getSubscriberCount('chat:general')).toBe(1)
			expect(manager.getSubscriberCount('chat:private')).toBe(1)

			manager.removeConnection(ws)

			expect(manager.getSubscriberCount('chat:general')).toBe(0)
			expect(manager.getSubscriberCount('chat:private')).toBe(0)
		})
	})

	describe('subscribe / unsubscribe', () => {
		it('should subscribe a connection to a channel', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			manager.subscribe(ws, 'chat:general')

			expect(manager.getSubscriberCount('chat:general')).toBe(1)
			expect(ws.data.subscribedChannels.has('chat:general')).toBe(true)
		})

		it('should unsubscribe a connection from a channel', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			manager.subscribe(ws, 'chat:general')
			manager.unsubscribe(ws, 'chat:general')

			expect(manager.getSubscriberCount('chat:general')).toBe(0)
			expect(ws.data.subscribedChannels.has('chat:general')).toBe(false)
		})

		it('should handle multiple subscribers on same channel', () => {
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			manager.addConnection(ws1)
			manager.addConnection(ws2)

			manager.subscribe(ws1, 'chat:general')
			manager.subscribe(ws2, 'chat:general')

			expect(manager.getSubscriberCount('chat:general')).toBe(2)
		})

		it('should clean up empty channel sets', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			manager.subscribe(ws, 'chat:general')
			manager.unsubscribe(ws, 'chat:general')

			// Internal channels map should not have the empty set
			expect(manager.getSubscriberCount('chat:general')).toBe(0)
		})
	})

	describe('publish', () => {
		it('should send messages to all subscribers', () => {
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			manager.addConnection(ws1)
			manager.addConnection(ws2)

			manager.subscribe(ws1, 'chat:general')
			manager.subscribe(ws2, 'chat:general')

			manager.publish('chat:general', 'message', { text: 'Hello' })

			const expected = JSON.stringify({
				type: 'event',
				channel: 'chat:general',
				event: 'message',
				payload: { text: 'Hello' },
			})

			expect((ws1 as any)._sent).toContain(expected)
			expect((ws2 as any)._sent).toContain(expected)
		})

		it('should not send to unsubscribed connections', () => {
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			manager.addConnection(ws1)
			manager.addConnection(ws2)

			manager.subscribe(ws1, 'chat:general')
			// ws2 is NOT subscribed

			manager.publish('chat:general', 'message', { text: 'Hello' })

			expect((ws1 as any)._sent.length).toBe(1)
			expect((ws2 as any)._sent.length).toBe(0)
		})

		it('should exclude specified connectionId', () => {
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			manager.addConnection(ws1)
			manager.addConnection(ws2)

			manager.subscribe(ws1, 'chat:general')
			manager.subscribe(ws2, 'chat:general')

			// Exclude conn-1 (e.g., don't echo back to sender)
			manager.publish('chat:general', 'message', { text: 'Hello' }, 'conn-1')

			expect((ws1 as any)._sent.length).toBe(0)
			expect((ws2 as any)._sent.length).toBe(1)
		})

		it('should handle publish to empty channel', () => {
			// Should not throw
			manager.publish('nonexistent', 'message', { text: 'Hello' })
		})

		it('should publish without payload', () => {
			const ws = createMockWS('conn-1')
			manager.addConnection(ws)
			manager.subscribe(ws, 'chat:general')

			manager.publish('chat:general', 'typing')

			const msg = JSON.parse((ws as any)._sent[0])
			expect(msg.type).toBe('event')
			expect(msg.event).toBe('typing')
			expect(msg.payload).toBeUndefined()
		})
	})

	describe('getSubscriberCount', () => {
		it('should return 0 for unknown channel', () => {
			expect(manager.getSubscriberCount('nonexistent')).toBe(0)
		})

		it('should return correct count', () => {
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			const ws3 = createMockWS('conn-3')
			manager.addConnection(ws1)
			manager.addConnection(ws2)
			manager.addConnection(ws3)

			manager.subscribe(ws1, 'room:1')
			manager.subscribe(ws2, 'room:1')
			manager.subscribe(ws3, 'room:1')

			expect(manager.getSubscriberCount('room:1')).toBe(3)

			manager.unsubscribe(ws2, 'room:1')
			expect(manager.getSubscriberCount('room:1')).toBe(2)
		})
	})

	describe('clear', () => {
		it('should remove all connections and channels', () => {
			const ws1 = createMockWS('conn-1')
			const ws2 = createMockWS('conn-2')
			manager.addConnection(ws1)
			manager.addConnection(ws2)
			manager.subscribe(ws1, 'chat:general')
			manager.subscribe(ws2, 'chat:general')

			manager.clear()

			expect(manager.getConnectionCount()).toBe(0)
			expect(manager.getSubscriberCount('chat:general')).toBe(0)
		})
	})
})
