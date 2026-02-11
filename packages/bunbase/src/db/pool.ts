import { SQL } from 'bun'

export interface PoolConfig {
	url?: string
	max?: number
	idleTimeout?: number
	connectionTimeout?: number
	maxLifetime?: number
}

/**
 * Creates a new Bun.sql connection pool with the given configuration.
 * Uses DATABASE_URL from environment if no URL is provided.
 */
export function createSQLPool(config?: PoolConfig): SQL {
	const url =
		config?.url ||
		process.env.DATABASE_URL ||
		'postgresql://postgres:postgres@localhost:5432/bunbase'

	return new SQL(url, {
		max: config?.max ?? 20,
		idleTimeout: config?.idleTimeout ?? 30000,
		connectionTimeout: config?.connectionTimeout ?? 10000,
		maxLifetime: config?.maxLifetime ?? 3600000,
	})
}

// Lazy singleton — created on first access
let _pool: SQL | null = null

export function getSQLPool(config?: PoolConfig): SQL {
	if (!_pool) {
		_pool = createSQLPool(config)
	}
	return _pool
}
