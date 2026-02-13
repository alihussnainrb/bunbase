import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { RealtimeClient } from './realtime.ts'
import type { ConnectionState } from './realtime.ts'

// Mock WebSocket
class MockWebSocket {
	static CONNECTING = 0
	static OPEN = 1
	static CLOSING = 2
	static CLOSED = 3

	readyState = MockWebSocket.CONNECTING
	url: string
	onopen: (() => void) | null = null
	onmessage: ((event: { data: string }) => void) | null = null
	onclose: (() => void) | null = null
	onerror: (() => void) | null = null
	sent: string[] = []

	constructor(url: string) {
		this.url = url
	}

	send(data: string): void {
		this.sent.push(data)
	}

	close(): void {
		this.readyState = MockWebSocket.CLOSED
		this.onclose?.()
	}

	// Test helpers
	simulateOpen(): void {
		this.readyState = MockWebSocket.OPEN
		this.onopen?.()
	}

	simulateMessage(data: unknown): void {
		this.onmessage?.({ data: JSON.stringify(data) })
	}

	simulateClose(): void {
		this.readyState = MockWebSocket.CLOSED
		this.onclose?.()
	}
}

// Store the original WebSocket and replace with mock
let mockWsInstances: MockWebSocket[] = []
const originalWebSocket = globalThis.WebSocket

beforeEach(() => {
	mockWsInstances = []
	;(globalThis as any).WebSocket = class extends MockWebSocket {
		constructor(url: string) {
			super(url)
			mockWsInstances.push(this)
		}
	}
	// Add static constants to the mock class
	;(globalThis as any).WebSocket.OPEN = MockWebSocket.OPEN
	;(globalThis as any).WebSocket.CONNECTING = MockWebSocket.CONNECTING
	;(globalThis as any).WebSocket.CLOSING = MockWebSocket.CLOSING
	;(globalThis as any).WebSocket.CLOSED = MockWebSocket.CLOSED
})

afterEach(() => {
	;(globalThis as any).WebSocket = originalWebSocket
})

describe('RealtimeClient', () => {
	describe('constructor', () => {
		it('should initialize with default options', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			expect(client.getState()).toBe('disconnected')
		})
	})

	describe('connect', () => {
		it('should create a WebSocket connection', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()

			expect(mockWsInstances.length).toBe(1)
			expect(mockWsInstances[0].url).toBe('ws://localhost:3000/ws')
		})

		it('should append token as query param', () => {
			const client = new RealtimeClient({
				url: 'ws://localhost:3000/ws',
				token: 'my-token',
			})
			client.connect()

			expect(mockWsInstances[0].url).toBe(
				'ws://localhost:3000/ws?token=my-token',
			)
		})

		it('should set state to connecting', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()

			expect(client.getState()).toBe('connecting')
		})

		it('should set state to connected on open', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			expect(client.getState()).toBe('connected')
		})

		it('should not create duplicate connections', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()
			client.connect() // Should be a no-op

			expect(mockWsInstances.length).toBe(1)
		})
	})

	describe('disconnect', () => {
		it('should close the WebSocket', () => {
			const client = new RealtimeClient({
				url: 'ws://localhost:3000/ws',
				autoReconnect: false,
			})
			client.connect()
			mockWsInstances[0].simulateOpen()
			client.disconnect()

			expect(client.getState()).toBe('disconnected')
		})

		it('should prevent auto-reconnect', () => {
			const client = new RealtimeClient({
				url: 'ws://localhost:3000/ws',
				autoReconnect: true,
			})
			client.connect()
			mockWsInstances[0].simulateOpen()
			client.disconnect()

			// Should not create a new connection
			expect(mockWsInstances.length).toBe(1)
		})
	})

	describe('subscribe / unsubscribe', () => {
		it('should send subscribe message when connected', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			client.subscribe('chat:general')

			expect(mockWsInstances[0].sent.length).toBe(1)
			const msg = JSON.parse(mockWsInstances[0].sent[0])
			expect(msg.type).toBe('subscribe')
			expect(msg.channel).toBe('chat:general')
		})

		it('should queue subscribe when not connected', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })

			client.subscribe('chat:general')
			// No messages sent yet (not connected)
			expect(mockWsInstances.length).toBe(0)

			// Now connect - should re-subscribe
			client.connect()
			mockWsInstances[0].simulateOpen()

			expect(mockWsInstances[0].sent.length).toBe(1)
			const msg = JSON.parse(mockWsInstances[0].sent[0])
			expect(msg.type).toBe('subscribe')
			expect(msg.channel).toBe('chat:general')
		})

		it('should send unsubscribe message', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			client.subscribe('chat:general')
			client.unsubscribe('chat:general')

			expect(mockWsInstances[0].sent.length).toBe(2)
			const msg = JSON.parse(mockWsInstances[0].sent[1])
			expect(msg.type).toBe('unsubscribe')
			expect(msg.channel).toBe('chat:general')
		})
	})

	describe('on / event handling', () => {
		it('should dispatch events to listeners', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			const received: unknown[] = []
			client.on('chat:general', 'message', (payload) => {
				received.push(payload)
			})

			mockWsInstances[0].simulateMessage({
				type: 'event',
				channel: 'chat:general',
				event: 'message',
				payload: { text: 'Hello' },
			})

			expect(received.length).toBe(1)
			expect(received[0]).toEqual({ text: 'Hello' })
		})

		it('should support wildcard listeners', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			const received: unknown[] = []
			client.on('chat:general', '*', (payload) => {
				received.push(payload)
			})

			mockWsInstances[0].simulateMessage({
				type: 'event',
				channel: 'chat:general',
				event: 'message',
				payload: { text: 'Hello' },
			})

			expect(received.length).toBe(1)
			expect(received[0]).toEqual({
				event: 'message',
				payload: { text: 'Hello' },
			})
		})

		it('should return unsubscribe function', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			const received: unknown[] = []
			const unsub = client.on('chat:general', 'message', (payload) => {
				received.push(payload)
			})

			// First event should be received
			mockWsInstances[0].simulateMessage({
				type: 'event',
				channel: 'chat:general',
				event: 'message',
				payload: { text: 'First' },
			})

			unsub()

			// Second event should not be received
			mockWsInstances[0].simulateMessage({
				type: 'event',
				channel: 'chat:general',
				event: 'message',
				payload: { text: 'Second' },
			})

			expect(received.length).toBe(1)
		})

		it('should not dispatch events for different channels', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			const received: unknown[] = []
			client.on('chat:general', 'message', (payload) => {
				received.push(payload)
			})

			mockWsInstances[0].simulateMessage({
				type: 'event',
				channel: 'chat:private',
				event: 'message',
				payload: { text: 'Hello' },
			})

			expect(received.length).toBe(0)
		})
	})

	describe('publish', () => {
		it('should send publish message', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })
			client.connect()
			mockWsInstances[0].simulateOpen()

			client.publish('chat:general', 'message', { text: 'Hello' })

			const msg = JSON.parse(mockWsInstances[0].sent[0])
			expect(msg.type).toBe('publish')
			expect(msg.channel).toBe('chat:general')
			expect(msg.event).toBe('message')
			expect(msg.payload).toEqual({ text: 'Hello' })
		})
	})

	describe('onStateChange', () => {
		it('should notify on state changes', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })

			const states: ConnectionState[] = []
			client.onStateChange((state) => {
				states.push(state)
			})

			client.connect()
			mockWsInstances[0].simulateOpen()

			expect(states).toEqual(['connecting', 'connected'])
		})

		it('should return unsubscribe function', () => {
			const client = new RealtimeClient({ url: 'ws://localhost:3000/ws' })

			const states: ConnectionState[] = []
			const unsub = client.onStateChange((state) => {
				states.push(state)
			})

			client.connect()
			unsub()
			mockWsInstances[0].simulateOpen()

			// Only 'connecting' should be captured, not 'connected'
			expect(states).toEqual(['connecting'])
		})
	})

	describe('reconnection', () => {
		it('should set state to disconnected on close', () => {
			const client = new RealtimeClient({
				url: 'ws://localhost:3000/ws',
				autoReconnect: false,
			})
			client.connect()
			mockWsInstances[0].simulateOpen()
			mockWsInstances[0].simulateClose()

			expect(client.getState()).toBe('disconnected')
		})

		it('should re-subscribe to channels after reconnect', () => {
			const client = new RealtimeClient({
				url: 'ws://localhost:3000/ws',
				autoReconnect: false,
			})

			// Subscribe before connecting
			client.subscribe('chat:general')
			client.subscribe('chat:private')

			client.connect()
			mockWsInstances[0].simulateOpen()

			// Should have sent 2 subscribe messages
			const subscribes = mockWsInstances[0].sent.filter(
				(m) => JSON.parse(m).type === 'subscribe',
			)
			expect(subscribes.length).toBe(2)
		})
	})
})
