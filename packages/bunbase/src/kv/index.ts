export type { KVStore } from './types.ts'
export { PostgresKVStore } from './postgres-kv.ts'

import type { SQL } from 'bun'
import { PostgresKVStore } from './postgres-kv.ts'

export function createKVStore(sql: SQL): PostgresKVStore {
	return new PostgresKVStore(sql)
}
