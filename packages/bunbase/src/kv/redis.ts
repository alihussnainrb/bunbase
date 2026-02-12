import type { RedisClient } from 'bun'
import type { KVStore } from './types.ts'

/**
 * Redis-backed key-value store
 * Uses Bun's native Redis client for high-performance operations
 */
export class RedisKVStore implements KVStore {
	constructor(private redis: RedisClient) {}

	async get<T = unknown>(key: string): Promise<T | null> {
		const value = await this.redis.get(key)
		if (value === null) {
			return null
		}
		try {
			return JSON.parse(value) as T
		} catch {
			// If not JSON, return as-is (for simple string values)
			return value as T
		}
	}

	async set(
		key: string,
		value: unknown,
		opts?: { ttl?: number },
	): Promise<void> {
		const serialized = JSON.stringify(value)
		await this.redis.set(key, serialized)

		// Set expiration if TTL provided
		if (opts?.ttl) {
			await this.redis.expire(key, opts.ttl)
		}
	}

	async delete(key: string): Promise<void> {
		await this.redis.del(key)
	}

	async has(key: string): Promise<boolean> {
		return await this.redis.exists(key)
	}

	async list(prefix?: string): Promise<string[]> {
		// Redis doesn't have a native "list by prefix" command
		// We need to use SCAN with MATCH pattern
		if (!prefix) {
			prefix = '*'
		} else {
			prefix = `${prefix}*`
		}

		// Use SCAN command via send() to get all matching keys
		// Note: This is a simple implementation. For production, consider
		// using SCAN cursor-based iteration for large key spaces
		const result = await this.redis.send('KEYS', [prefix])
		return Array.isArray(result) ? result : []
	}
}
