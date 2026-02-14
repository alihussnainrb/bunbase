import type { RedisClient } from 'bun'

/**
 * Distributed lock using Redis SET NX EX pattern.
 * Ensures only one instance acquires the lock at a time.
 */
export class DistributedLock {
	private value: string

	constructor(
		private redis: RedisClient,
		private key: string,
		private ttlSeconds: number,
	) {
		// Generate unique value for this lock instance
		this.value = `${Date.now()}-${Math.random().toString(36).slice(2)}`
	}

	/**
	 * Try to acquire lock. Returns true if acquired, false if already held.
	 * Uses Redis SET NX (set if not exists) with expiration for atomic operation.
	 */
	async acquire(): Promise<boolean> {
		try {
			// SET key value NX EX ttl
			// NX = only set if key doesn't exist
			// EX = set expiration in seconds
			const result = await this.redis.send('SET', [
				this.key,
				this.value,
				'NX',
				'EX',
				this.ttlSeconds.toString(),
			])
			return result === 'OK'
		} catch {
			return false
		}
	}

	/**
	 * Release lock (best effort - TTL ensures eventual release).
	 * Only releases if this instance still holds the lock.
	 */
	async release(): Promise<void> {
		try {
			// Check if we still hold the lock before deleting
			const currentValue = await this.redis.send('GET', [this.key])
			if (currentValue === this.value) {
				await this.redis.send('DEL', [this.key])
			}
		} catch {
			// Ignore errors - TTL will expire the lock eventually
		}
	}
}

/**
 * Execute function with distributed lock.
 * Only runs if lock is acquired. Returns null if lock is held by another instance.
 *
 * @example
 * ```typescript
 * const result = await withLock(
 *   redis,
 *   'job:send-emails',
 *   300, // 5 minutes
 *   async () => {
 *     // Critical section - only one instance executes this
 *     await sendBatchEmails()
 *     return { sent: 100 }
 *   }
 * )
 *
 * if (result === null) {
 *   console.log('Another instance is processing this job')
 * }
 * ```
 */
export async function withLock<T>(
	redis: RedisClient,
	lockKey: string,
	ttlSeconds: number,
	fn: () => Promise<T>,
): Promise<T | null> {
	const lock = new DistributedLock(redis, lockKey, ttlSeconds)

	const acquired = await lock.acquire()
	if (!acquired) {
		return null // Lock held by another instance
	}

	try {
		return await fn()
	} finally {
		await lock.release()
	}
}
