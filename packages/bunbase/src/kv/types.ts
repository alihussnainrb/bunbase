export interface KVStore {
	/** Get a value by key. Returns null if not found or expired. */
	get<T = unknown>(key: string): Promise<T | null>
	/** Set a value with optional TTL in seconds. */
	set(key: string, value: unknown, opts?: { ttl?: number }): Promise<void>
	/** Delete a key. */
	delete(key: string): Promise<void>
	/** Check if a key exists (and is not expired). */
	has(key: string): Promise<boolean>
	/** List keys matching a prefix. */
	list(prefix?: string): Promise<string[]>
}
