import type { SQL } from 'bun'
import type { KVStore } from './types.ts'

/**
 * PostgreSQL-backed key-value store with TTL support.
 * Uses a `kv_store` table with JSONB values and optional expiration.
 */
export class PostgresKVStore implements KVStore {
	constructor(private readonly sql: SQL) {}

	/** Ensure the kv_store table exists */
	async ensureTable(): Promise<void> {
		await this.sql`
			CREATE TABLE IF NOT EXISTS kv_store (
				key TEXT PRIMARY KEY,
				value JSONB NOT NULL,
				expires_at TIMESTAMPTZ
			)
		`
		await this.sql`
			CREATE INDEX IF NOT EXISTS idx_kv_store_expires ON kv_store(expires_at)
			WHERE expires_at IS NOT NULL
		`
	}

	async get<T = unknown>(key: string): Promise<T | null> {
		const rows = await this.sql`
			SELECT value FROM kv_store
			WHERE key = ${key}
				AND (expires_at IS NULL OR expires_at > NOW())
		`
		if (rows.length === 0) return null
		return rows[0]!.value as T
	}

	async set(
		key: string,
		value: unknown,
		opts?: { ttl?: number },
	): Promise<void> {
		const expiresAt = opts?.ttl ? new Date(Date.now() + opts.ttl * 1000) : null

		await this.sql`
			INSERT INTO kv_store (key, value, expires_at)
			VALUES (${key}, ${JSON.stringify(value)}, ${expiresAt})
			ON CONFLICT (key) DO UPDATE SET
				value = EXCLUDED.value,
				expires_at = EXCLUDED.expires_at
		`
	}

	async delete(key: string): Promise<void> {
		await this.sql`DELETE FROM kv_store WHERE key = ${key}`
	}

	async has(key: string): Promise<boolean> {
		const rows = await this.sql`
			SELECT 1 FROM kv_store
			WHERE key = ${key}
				AND (expires_at IS NULL OR expires_at > NOW())
		`
		return rows.length > 0
	}

	async list(prefix?: string): Promise<string[]> {
		const rows = prefix
			? await this.sql`
				SELECT key FROM kv_store
				WHERE key LIKE ${prefix + '%'}
					AND (expires_at IS NULL OR expires_at > NOW())
				ORDER BY key
			`
			: await this.sql`
				SELECT key FROM kv_store
				WHERE expires_at IS NULL OR expires_at > NOW()
				ORDER BY key
			`
		return rows.map((r: any) => r.key)
	}
}
