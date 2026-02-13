import {
	useMutation as useTanStackMutation,
	useQuery as useTanStackQuery,
	type UseMutationOptions,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
} from '@tanstack/react-query'
import type { BunbaseClient } from './client.ts'
import type {
	ActionInput,
	ActionName,
	ActionOutput,
	BaseAPI,
	BunbaseError,
} from './types.ts'

/**
 * Create hooks for a Bunbase client
 */
export function createHooks<API extends BaseAPI>(client: BunbaseClient<API>) {
	/**
	 * React hook for query actions (typically GET operations)
	 */
	function useQuery<Action extends ActionName<API>>(
		action: Action,
		input?: ActionInput<API, Action>,
		options?: Omit<
			UseQueryOptions<
				ActionOutput<API, Action>,
				BunbaseError,
				ActionOutput<API, Action>,
				[Action, ActionInput<API, Action>?]
			>,
			'queryKey' | 'queryFn'
		>,
	): UseQueryResult<ActionOutput<API, Action>, BunbaseError> {
		return useTanStackQuery({
			queryKey: [action, input] as [Action, ActionInput<API, Action>?],
			queryFn: async () => {
				return client.call(action, input)
			},
			...options,
		})
	}

	/**
	 * React hook for mutation actions (POST, PATCH, DELETE operations)
	 */
	function useMutation<Action extends ActionName<API>>(
		action: Action,
		options?: Omit<
			UseMutationOptions<
				ActionOutput<API, Action>,
				BunbaseError,
				ActionInput<API, Action>,
				unknown
			>,
			'mutationFn'
		>,
	): UseMutationResult<
		ActionOutput<API, Action>,
		BunbaseError,
		ActionInput<API, Action>,
		unknown
	> {
		return useTanStackMutation({
			mutationFn: async (input: ActionInput<API, Action>) => {
				return client.call(action, input)
			},
			...options,
		})
	}

	return {
		useQuery,
		useMutation,
	}
}
