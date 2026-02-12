import type { ActionContext } from '../types.ts'
import { saasGuards } from './saas.ts'
import { GuardError, type GuardFn, type RateLimitOptions } from './types.ts'

// Export Redis rate limiter for server initialization
export { createRedisRateLimiter } from './rate-limit-redis.ts'

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
	inOrg: saasGuards.inOrg,
	hasFeature: saasGuards.hasFeature,
	trialActiveOrPaid: saasGuards.trialActiveOrPaid,

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
	 * Simple in-memory rate limiter.
	 * Note: Does not persist across server restarts or scale horizontally.
	 */
	rateLimit: (opts: RateLimitOptions): GuardFn => {
		const hits = new Map<string, number[]>()

		return (ctx: ActionContext) => {
			// Default key is IP address or user ID
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
