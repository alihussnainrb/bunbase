import { BunbaseClient } from './client.ts'
import { createHooks } from './hooks.ts'
import type { BaseAPI, BunbaseClientOptions } from './types.ts'

export { BunbaseClient } from './client.ts'
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
) {
	const client = new BunbaseClient<API>(options)
	const hooks = createHooks<API>(client)

	return {
		/**
		 * Direct API call (without hooks)
		 * Use in async functions or server-side code
		 */
		call: client.call.bind(client),

		/**
		 * React hook for query actions
		 * Automatically manages loading, error, and data states
		 */
		useQuery: hooks.useQuery,

		/**
		 * React hook for mutation actions
		 * Handles create, update, delete operations
		 */
		useMutation: hooks.useMutation,

		/**
		 * Update default headers (e.g., for authentication)
		 */
		setHeaders: client.setHeaders.bind(client),

		/**
		 * Get current headers
		 */
		getHeaders: client.getHeaders.bind(client),

		/**
		 * Update base URL
		 */
		setBaseUrl: client.setBaseUrl.bind(client),

		/**
		 * Get current base URL
		 */
		getBaseUrl: client.getBaseUrl.bind(client),

		/**
		 * Access underlying client instance
		 */
		_client: client,
	}
}

/**
 * Type helper to infer API type from client
 */
export type InferAPI<T> =
	T extends ReturnType<typeof createBunbaseClient<infer API extends BaseAPI>>
		? API
		: never
