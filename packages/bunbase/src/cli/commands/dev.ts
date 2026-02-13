import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { RedisClient } from 'bun'
import { loadConfig } from '../../config/loader.ts'
import { ActionRegistry } from '../../core/registry.ts'
import { createDB } from '../../db/client.ts'
import { createSQLPool } from '../../db/pool.ts'
import { Logger } from '../../logger/index.ts'
import { WriteBuffer } from '../../persistence/write-buffer.ts'
import { eventBus } from '../../runtime/event-bus.ts'
import { loadActions } from '../../runtime/loader.ts'
import { BunbaseServer } from '../../runtime/server.ts'

export async function devCommand(): Promise<void> {
	// 1. Load config
	const config = await loadConfig()
	const port = config.port ?? 3000
	const hostname = config.hostname ?? '0.0.0.0'
	const actionsDir = config.actionsDir ?? 'src'

	const logger = new Logger({
		level: 'debug',
	})

	// 2. Create database connection pool
	const sqlPool = createSQLPool({
		url: config.database?.url,
		max: config.database?.maxConnections,
		idleTimeout: config.database?.idleTimeout,
	})

	const db = createDB(sqlPool)

	// 3. Create write buffer and attach SQL pool
	const writeBuffer = new WriteBuffer({
		enabled: config.persistence?.enabled ?? true,
		flushIntervalMs: config.persistence?.flushIntervalMs,
		maxBufferSize: config.persistence?.maxBufferSize,
	})
	writeBuffer.setSql(sqlPool)

	// 4. Auto-run pending migrations in dev mode
	const migrationsDir = join(
		process.cwd(),
		config.database?.migrations?.directory ?? 'migrations',
	)
	if (existsSync(migrationsDir)) {
		try {
			const { Migrator } = await import('../../db/migrator.ts')
			const migrator = new Migrator(sqlPool, migrationsDir)
			const result = await migrator.run()
			if (result.applied.length > 0) {
				logger.info(`Applied ${result.applied.length} pending migration(s)`)
				for (const name of result.applied) {
					logger.info(`  ✓ ${name}`)
				}
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err)
			logger.error('Migration failed:', message)
		}
	}

	// 5. Create Redis client if configured
	let redis: RedisClient | undefined
	if (config.redis) {
		try {
			const redisUrl =
				config.redis.url ??
				process.env.REDIS_URL ??
				process.env.VALKEY_URL ??
				'redis://localhost:6379'

			redis = new RedisClient(redisUrl, {
				connectionTimeout: config.redis.connectionTimeout ?? 5000,
				idleTimeout: config.redis.idleTimeout ?? 30000,
				autoReconnect: config.redis.autoReconnect ?? true,
				maxRetries: config.redis.maxRetries ?? 10,
				tls: config.redis.tls ?? false,
			})

			// Test connection
			await redis.connect()
			logger.info(`Connected to Redis at ${redisUrl}`)

			// Attach Redis to EventBus for distributed event propagation
			await eventBus.attachRedis(redis)
			logger.info('EventBus using Redis Pub/Sub for cross-instance events')
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err)
			logger.warn(`Failed to connect to Redis: ${message}`)
			logger.warn('Falling back to Postgres for KV store')
			redis = undefined
		}
	}

	// 6. Create storage, mailer, and KV
	let storage: import('../../storage/types.ts').StorageAdapter | undefined
	let mailer: import('../../mailer/types.ts').MailerAdapter | undefined
	let kv: import('../../kv/types.ts').KVStore | undefined

	try {
		const { createStorage } = await import('../../storage/index.ts')
		storage = createStorage(config.storage)
	} catch {
		// Storage module not yet available
	}

	if (config.mailer) {
		try {
			const { createMailer } = await import('../../mailer/index.ts')
			mailer = createMailer(config.mailer) ?? undefined
			if (mailer) {
				console.log(`✓ Mailer configured (${config.mailer.provider ?? 'smtp'})`)
			}
		} catch (err) {
			console.warn('⚠ Failed to initialize mailer:', err)
		}
	}

	try {
		const { createKVStore } = await import('../../kv/index.ts')
		kv = createKVStore(sqlPool, redis)
		if (
			!redis &&
			kv &&
			'ensureTable' in kv &&
			typeof kv.ensureTable === 'function'
		) {
			// Only ensure table if using Postgres backend
			await kv.ensureTable()
		}
	} catch {
		// KV module not yet available
	}

	const registry = new ActionRegistry()

	logger.info('Starting Bunbase in development mode...')
	logger.info(`Scanning for actions in: ${actionsDir}`)

	// 6. Load actions
	const startLoad = performance.now()
	await loadActions(actionsDir, registry, logger)
	const loadDuration = (performance.now() - startLoad).toFixed(2)
	logger.info(`Loaded ${registry.size} actions in ${loadDuration}ms`)

	// 7. Start server
	const server = new BunbaseServer(registry, logger, writeBuffer, config, {
		db,
		storage,
		mailer,
		kv,
		redis,
	})

	try {
		server.start({
			port,
			hostname,
			mcp: config.mcp,
		})

		if (config.realtime?.enabled) {
			const wsPath = config.realtime.path ?? '/ws'
			logger.info(`WebSocket: ws://${hostname}:${port}${wsPath}`)
		}

		// Graceful shutdown handler (shared for SIGINT and SIGTERM)
		const shutdown = async () => {
			logger.info('Shutting down...')
			server.stop()
			await eventBus.detach()
			await writeBuffer.shutdown()
			sqlPool.close()
			if (redis) {
				redis.close()
			}
			process.exit(0)
		}

		// Handle SIGINT (Ctrl+C)
		process.on('SIGINT', shutdown)

		// Handle SIGTERM (Docker/K8s graceful shutdown)
		process.on('SIGTERM', shutdown)
	} catch (err) {
		logger.error('Failed to start server:', err)
		process.exit(1)
	}
}
