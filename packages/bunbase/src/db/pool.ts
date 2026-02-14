import { SQL } from 'bun'

export interface PoolConfig {
	url?: string
	max?: number
	idleTimeout?: number
	connectionTimeout?: number
	maxLifetime?: number
	/** Number of retry attempts for initial connection (default: 5) */
	retryAttempts?: number
	/** Base delay between retries in ms (default: 1000) */
	retryDelayMs?: number
	/** Health check interval in ms (default: 30000 = 30s) */
	healthCheckIntervalMs?: number
	/** Callbacks for connection lifecycle events */
	onConnectionError?: (error: Error, attempt: number) => void
	onConnectionRestore?: () => void
	onHealthCheckFail?: (error: Error) => void
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

/**
 * Connection state for tracking health
 */
interface ConnectionState {
	isConnected: boolean
	lastHealthCheck: number
	consecutiveFailures: number
	totalQueries: number
	failedQueries: number
}

/**
 * Resilient SQL pool wrapper with retry logic, health checks, and auto-reconnect.
 * Wraps Bun's SQL pool to add production-grade connection resilience.
 */
export class ResilientSQLPool {
	private pool: SQL | null = null
	private readonly config: Required<
		Pick<
			PoolConfig,
			| 'url'
			| 'max'
			| 'idleTimeout'
			| 'connectionTimeout'
			| 'maxLifetime'
			| 'retryAttempts'
			| 'retryDelayMs'
			| 'healthCheckIntervalMs'
		>
	>
	private readonly callbacks: {
		onConnectionError?: (error: Error, attempt: number) => void
		onConnectionRestore?: () => void
		onHealthCheckFail?: (error: Error) => void
	}
	private healthCheckInterval: Timer | null = null
	private state: ConnectionState = {
		isConnected: false,
		lastHealthCheck: 0,
		consecutiveFailures: 0,
		totalQueries: 0,
		failedQueries: 0,
	}

	constructor(config?: PoolConfig) {
		const url =
			config?.url ||
			process.env.DATABASE_URL ||
			'postgresql://postgres:postgres@localhost:5432/bunbase'

		this.config = {
			url,
			max: config?.max ?? 20,
			idleTimeout: config?.idleTimeout ?? 30000,
			connectionTimeout: config?.connectionTimeout ?? 10000,
			maxLifetime: config?.maxLifetime ?? 3600000,
			retryAttempts: config?.retryAttempts ?? 5,
			retryDelayMs: config?.retryDelayMs ?? 1000,
			healthCheckIntervalMs: config?.healthCheckIntervalMs ?? 30000,
		}

		this.callbacks = {
			onConnectionError: config?.onConnectionError,
			onConnectionRestore: config?.onConnectionRestore,
			onHealthCheckFail: config?.onHealthCheckFail,
		}
	}

	/**
	 * Connects to the database with retry logic.
	 * Uses exponential backoff for retries.
	 */
	async connect(): Promise<void> {
		const maxAttempts = this.config.retryAttempts
		let lastError: Error | null = null

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				// Create new pool
				this.pool = new SQL(this.config.url, {
					max: this.config.max,
					idleTimeout: this.config.idleTimeout,
					connectionTimeout: this.config.connectionTimeout,
					maxLifetime: this.config.maxLifetime,
				})

				// Test connection with simple query
				await this.pool`SELECT 1`

				// Connection successful
				this.state.isConnected = true
				this.state.consecutiveFailures = 0

				// Start health check interval
				this.startHealthCheck()

				// Notify restore if this was a retry
				if (attempt > 1 && this.callbacks.onConnectionRestore) {
					this.callbacks.onConnectionRestore()
				}

				return
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err))
				this.state.isConnected = false
				this.state.consecutiveFailures++

				// Notify error callback
				if (this.callbacks.onConnectionError) {
					this.callbacks.onConnectionError(lastError, attempt)
				}

				// If not last attempt, wait with exponential backoff
				if (attempt < maxAttempts) {
					const delay = this.config.retryDelayMs * 2 ** (attempt - 1)
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		// All attempts failed
		throw new Error(
			`Failed to connect to database after ${maxAttempts} attempts: ${lastError?.message}`,
		)
	}

	/**
	 * Performs a health check on the connection.
	 * Returns true if healthy, false otherwise.
	 */
	async healthCheck(): Promise<boolean> {
		if (!this.pool) {
			return false
		}

		try {
			const start = Date.now()
			await this.pool`SELECT 1`
			const latency = Date.now() - start

			this.state.lastHealthCheck = Date.now()
			this.state.isConnected = true
			this.state.consecutiveFailures = 0

			return true
		} catch (err) {
			this.state.isConnected = false
			this.state.consecutiveFailures++

			const error = err instanceof Error ? err : new Error(String(err))

			if (this.callbacks.onHealthCheckFail) {
				this.callbacks.onHealthCheckFail(error)
			}

			// Try to reconnect after health check failures
			if (this.state.consecutiveFailures >= 3) {
				try {
					await this.connect()
				} catch {
					// Reconnect failed, will retry on next health check
				}
			}

			return false
		}
	}

	/**
	 * Starts periodic health checks.
	 */
	private startHealthCheck(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
		}

		this.healthCheckInterval = setInterval(async () => {
			await this.healthCheck()
		}, this.config.healthCheckIntervalMs)
	}

	/**
	 * Stops health checks.
	 */
	private stopHealthCheck(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = null
		}
	}

	/**
	 * Gets the underlying SQL pool.
	 * Throws if not connected.
	 */
	getPool(): SQL {
		if (!this.pool) {
			throw new Error('Database pool not initialized. Call connect() first.')
		}
		return this.pool
	}

	/**
	 * Gets connection metrics.
	 */
	getMetrics(): ConnectionState {
		return { ...this.state }
	}

	/**
	 * Checks if connected.
	 */
	isConnected(): boolean {
		return this.state.isConnected
	}

	/**
	 * Closes the pool and stops health checks.
	 */
	async close(): Promise<void> {
		this.stopHealthCheck()

		if (this.pool) {
			await this.pool.end()
			this.pool = null
		}

		this.state.isConnected = false
	}
}

// Lazy singleton — created on first access
let _pool: SQL | null = null

export function getSQLPool(config?: PoolConfig): SQL {
	if (!_pool) {
		_pool = createSQLPool(config)
	}
	return _pool
}
