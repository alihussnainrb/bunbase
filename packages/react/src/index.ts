import { BunbaseClient } from './client.ts'
import type { BunbaseHooks } from './hooks.ts'
import { createHooks } from './hooks.ts'
import type { RealtimeOptions } from './realtime.ts'
import { RealtimeClient } from './realtime.ts'
import type {
	ActionInput,
	ActionName,
	ActionOutput,
	BaseAPI,
	BunbaseClientOptions,
} from './types.ts'

export { BunbaseClient } from './client.ts'
export type { BunbaseHooks } from './hooks.ts'
export type { ConnectionState, RealtimeOptions } from './realtime.ts'
// Realtime WebSocket client and hooks
export { RealtimeClient } from './realtime.ts'
export {
	useConnectionState,
	useRealtimeChannel,
	useRealtimeEvent,
	useRealtimeMessages,
} from './realtime-hooks.ts'
export type {
	ActionInput,
	ActionName,
	ActionOutput,
	BaseAPI,
	BunbaseClientOptions,
	HttpFieldMetadata,
} from './types.ts'
export { BunbaseError } from './types.ts'

/**
 * Return type for createBunbaseClient - explicit for --isolatedDeclarations
 */
export interface BunbaseClientInstance<API extends BaseAPI> {
	call: <Action extends ActionName<API>>(
		action: Action,
		input?: ActionInput<API, Action>,
	) => Promise<ActionOutput<API, Action>>
	useQuery: BunbaseHooks<API>['useQuery']
	useMutation: BunbaseHooks<API>['useMutation']
	setHeaders: (headers: Record<string, string>) => void
	getHeaders: () => Record<string, string>
	setBaseUrl: (baseUrl: string) => void
	getBaseUrl: () => string
	connectRealtime: (opts?: Partial<RealtimeOptions>) => RealtimeClient
	_client: BunbaseClient<API>
}

/**
 * Create a fully-typed Bunbase client with React hooks
 *
 * @example
 * ```ts
 * import { createBunbaseClient } from '@bunbase/react'
 * import type { BunbaseAPI } from './.bunbase/api'
 * import { bunbaseAPISchema } from './.bunbase/api'
 *
 * export const bunbase = createBunbaseClient<BunbaseAPI>({
 *   baseUrl: 'http://localhost:3000',
 *   schema: bunbaseAPISchema, // Enables automatic HTTP field routing
 * })
 *
 * // Use in components - all HTTP fields automatically routed!
 * const { data } = bunbase.useQuery('login', {
 *   email: 'user@example.com',   // → body
 *   password: 'secret',           // → body
 *   apiKey: 'key',               // → X-API-Key header
 *   remember: true               // → ?remember=true query
 * })
 * ```
 */
export function createBunbaseClient<API extends BaseAPI>(
	options: BunbaseClientOptions<API>,
): BunbaseClientInstance<API> {
	const client = new BunbaseClient<API>(options)
	const hooks = createHooks<API>(client)

	return {
		call: <Action extends ActionName<API>>(
			action: Action,
			input?: ActionInput<API, Action>,
		): Promise<ActionOutput<API, Action>> => client.call(action, input),

		useQuery: hooks.useQuery,

		useMutation: hooks.useMutation,

		setHeaders: (headers: Record<string, string>): void =>
			client.setHeaders(headers),

		getHeaders: (): Record<string, string> => client.getHeaders(),

		setBaseUrl: (baseUrl: string): void => client.setBaseUrl(baseUrl),

		getBaseUrl: (): string => client.getBaseUrl(),

		connectRealtime: (opts?: Partial<RealtimeOptions>): RealtimeClient => {
			const baseUrl = client.getBaseUrl()
			const wsUrl = baseUrl.replace(/^http/, 'ws') + (opts?.url ?? '/ws')
			return new RealtimeClient({ ...opts, url: wsUrl })
		},

		_client: client,
	}
}

/**
 * Type helper to infer API type from client
 */
export type InferAPI<T> =
	T extends BunbaseClientInstance<infer API extends BaseAPI> ? API : never
