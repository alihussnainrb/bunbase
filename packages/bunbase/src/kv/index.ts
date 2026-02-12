export { PostgresKVStore } from './postgres-kv.ts'
export { RedisKVStore } from './redis.ts'
export type { KVStore } from './types.ts'

import type { RedisClient, SQL } from 'bun'
import { PostgresKVStore } from './postgres-kv.ts'
import { RedisKVStore } from './redis.ts'
import type { KVStore } from './types.ts'

/**
 * Create a KV store instance.
 * If redis client is provided, uses Redis, otherwise falls back to Postgres.
 */
export function createKVStore(sql: SQL, redis?: RedisClient): KVStore {
	if (redis) {
		return new RedisKVStore(redis)
	}
	return new PostgresKVStore(sql)
}
