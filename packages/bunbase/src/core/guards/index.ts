import type { ActionContext } from '../types.ts'
import { authGuards } from './auth.ts'
import { GuardError, type GuardFn, type RateLimitOptions } from './types.ts'

// Export Redis rate limiter for server initialization
export { createRedisRateLimiter } from './rate-limit-redis.ts'

// Export guard execution control
export { sequential, parallel } from './execution.ts'

/**
 * Standard guards for common checks.
 */
export const guards: {
	inOrg: () => GuardFn
	hasFeature: (feature: string) => GuardFn
	trialActiveOrPaid: () => GuardFn
	authenticated: () => GuardFn
	hasRole: (role: string) => GuardFn
	hasPermission: (permission: string) => GuardFn
	rateLimit: (opts: RateLimitOptions) => GuardFn
} = {
	inOrg: authGuards.inOrg,
	hasFeature: authGuards.hasFeature,
	trialActiveOrPaid: authGuards.trialActiveOrPaid,

	/**
	 * Ensure the user is authenticated.
	 */
	authenticated: (): GuardFn => {
		return (ctx: ActionContext) => {
			if (!ctx.auth.userId) {
				throw new GuardError('Unauthorized', 401)
			}
		}
	},

	/**
	 * Ensure the user has a specific role.
	 */
	hasRole: (role: string): GuardFn => {
		return (ctx: ActionContext) => {
			if (!ctx.auth.userId) {
				throw new GuardError('Unauthorized', 401)
			}
			if (ctx.auth.role !== role) {
				throw new GuardError('Forbidden', 403)
			}
		}
	},

	/**
	 * Ensure the user has a specific permission.
	 */
	hasPermission: (permission: string): GuardFn => {
		return (ctx: ActionContext) => {
			if (!ctx.auth.userId) {
				throw new GuardError('Unauthorized', 401)
			}
			if (!ctx.auth.permissions?.includes(permission)) {
				throw new GuardError('Forbidden', 403)
			}
		}
	},

	/**
	 * Rate limiter that automatically uses Redis when available, falls back to in-memory.
	 *
	 * - With Redis: Persists across restarts, works across multiple instances
	 * - Without Redis: In-memory only, does not persist or scale horizontally
	 *
	 * To enable Redis rate limiting, configure redis in bunbase.config.ts
	 */
	rateLimit: (opts: RateLimitOptions): GuardFn => {
		const hits = new Map<string, number[]>()
		let redisGuard: GuardFn | null = null

		return async (ctx: ActionContext) => {
			// Use Redis rate limiter if available
			if (ctx.redis) {
				if (!redisGuard) {
					const { createRedisRateLimiter } = await import(
						'./rate-limit-redis.ts'
					)
					redisGuard = createRedisRateLimiter(ctx.redis, opts)
				}
				return await redisGuard(ctx)
			}

			// Fall back to in-memory rate limiter
			const key = opts.key ? opts.key(ctx) : ctx.auth.userId || 'anonymous'
			const now = Date.now()

			// Get existing timestamps for this key
			const timestamps = hits.get(key) || []

			// Filter timestamps within the window
			const windowStart = now - opts.windowMs
			const validTimestamps = timestamps.filter((t) => t > windowStart)

			if (validTimestamps.length >= opts.limit) {
				throw new GuardError('Too Many Requests', 429)
			}

			validTimestamps.push(now)
			hits.set(key, validTimestamps)
		}
	},
}
