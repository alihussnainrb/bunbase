import type { RedisClient } from 'bun'
import type { ActionContext } from '../types.ts'
import { GuardError, type GuardFn, type RateLimitOptions } from './types.ts'

/**
 * Redis-backed rate limiter using sliding window algorithm
 * Persists across server restarts and scales horizontally
 */
export function createRedisRateLimiter(
	redis: RedisClient,
	opts: RateLimitOptions,
): GuardFn {
	return async (ctx: ActionContext) => {
		// Default key is IP address or user ID
		const key = opts.key ? opts.key(ctx) : ctx.auth.userId || 'anonymous'
		const redisKey = `ratelimit:${key}`
		const now = Date.now()
		const windowStart = now - opts.windowMs

		// Use sorted set to store timestamps
		// Score is the timestamp, value is a unique ID
		const timestampId = `${now}:${Math.random()}`

		// Remove old timestamps outside the window
		await redis.send('ZREMRANGEBYSCORE', [
			redisKey,
			'0',
			windowStart.toString(),
		])

		// Count current requests in window
		const count = await redis.send('ZCARD', [redisKey])
		const currentCount = typeof count === 'number' ? count : 0

		if (currentCount >= opts.limit) {
			throw new GuardError('Too Many Requests', 429)
		}

		// Add current timestamp
		await redis.send('ZADD', [redisKey, now.toString(), timestampId])

		// Set expiration on the key (window + buffer)
		const expirySeconds = Math.ceil(opts.windowMs / 1000) + 10
		await redis.expire(redisKey, expirySeconds)
	}
}
