import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import type { ConnectionState, RealtimeClient } from './realtime.ts'

/**
 * Subscribe to a specific event on a channel.
 * Automatically manages channel subscription lifecycle.
 *
 * @example
 * useRealtimeEvent(client, 'chat:general', 'message', (payload) => {
 *   console.log('New message:', payload)
 * })
 */
export function useRealtimeEvent(
	client: RealtimeClient,
	channel: string,
	event: string,
	callback: (payload: unknown) => void,
): void {
	const callbackRef = useRef(callback)
	callbackRef.current = callback

	useEffect(() => {
		client.subscribe(channel)
		const unsub = client.on(channel, event, (payload) => {
			callbackRef.current(payload)
		})

		return () => {
			unsub()
			client.unsubscribe(channel)
		}
	}, [client, channel, event])
}

/**
 * Get a channel handle with publish/subscribe methods.
 *
 * @example
 * const channel = useRealtimeChannel(client, 'chat:general')
 * channel.publish('message', { text: 'Hello!' })
 * channel.on('message', (payload) => console.log(payload))
 */
export function useRealtimeChannel(
	client: RealtimeClient,
	channel: string,
): {
	publish: (event: string, payload?: unknown) => void
	on: (event: string, callback: (payload: unknown) => void) => () => void
} {
	useEffect(() => {
		client.subscribe(channel)
		return () => {
			client.unsubscribe(channel)
		}
	}, [client, channel])

	const publish = useCallback(
		(event: string, payload?: unknown) => {
			client.publish(channel, event, payload)
		},
		[client, channel],
	)

	const on = useCallback(
		(event: string, callback: (payload: unknown) => void) => {
			return client.on(channel, event, callback)
		},
		[client, channel],
	)

	return { publish, on }
}

/**
 * Track the WebSocket connection state reactively.
 *
 * @example
 * const state = useConnectionState(client) // 'connected' | 'disconnected' | ...
 */
export function useConnectionState(client: RealtimeClient): ConnectionState {
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			return client.onStateChange(onStoreChange)
		},
		[client],
	)

	const getSnapshot = useCallback(() => {
		return client.getState()
	}, [client])

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Collect events from a channel into a state array.
 * Useful for building chat UIs, activity feeds, etc.
 *
 * @example
 * const messages = useRealtimeMessages<Message>(client, 'chat:general', 'message')
 * // messages: Message[]
 */
export function useRealtimeMessages<T = unknown>(
	client: RealtimeClient,
	channel: string,
	event: string,
	opts?: { maxMessages?: number },
): T[] {
	const [messages, setMessages] = useState<T[]>([])
	const maxMessages = opts?.maxMessages ?? 100

	useRealtimeEvent(client, channel, event, (payload) => {
		setMessages((prev) => {
			const next = [...prev, payload as T]
			if (next.length > maxMessages) {
				return next.slice(-maxMessages)
			}
			return next
		})
	})

	return messages
}
