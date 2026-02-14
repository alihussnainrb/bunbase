import type { GuardFn } from '../types.ts'

/**
 * Wrapped guards with explicit execution mode.
 * Used to override the global default execution mode.
 */
export interface WrappedGuards {
	_mode: 'sequential' | 'parallel'
	guards: GuardFn[]
}

/**
 * Wrap guards to execute sequentially (one after another).
 * Guards run in order, and if one fails, subsequent guards are not executed.
 *
 * @example
 * ```typescript
 * import { sequential, authenticated, hasRole } from 'bunbase'
 *
 * export const admin = action({
 *   guards: sequential([authenticated(), hasRole('admin')]),
 *   // ...
 * })
 * ```
 */
export function sequential(guards: GuardFn[]): WrappedGuards {
	return { _mode: 'sequential', guards }
}

/**
 * Wrap guards to execute in parallel (all at once).
 * All guards execute concurrently. If any guard fails, all are rejected.
 * Use only when guards are independent and have no ordering requirements.
 *
 * @example
 * ```typescript
 * import { parallel, authenticated, rateLimit } from 'bunbase'
 *
 * export const upload = action({
 *   guards: parallel([authenticated(), rateLimit({ requests: 10, window: 60 })]),
 *   // ...
 * })
 * ```
 */
export function parallel(guards: GuardFn[]): WrappedGuards {
	return { _mode: 'parallel', guards }
}

/**
 * Type guard to check if a value is a WrappedGuards object.
 */
export function isWrappedGuards(val: unknown): val is WrappedGuards {
	return (
		typeof val === 'object' &&
		val !== null &&
		'_mode' in val &&
		'guards' in val &&
		(val as WrappedGuards)._mode in { sequential: true, parallel: true }
	)
}
