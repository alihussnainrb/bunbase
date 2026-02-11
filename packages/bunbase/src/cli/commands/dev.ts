import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { ActionRegistry } from '../../core/registry.ts'
import { createDB } from '../../db/client.ts'
import { createSQLPool } from '../../db/pool.ts'
import { Logger } from '../../logger/index.ts'
import { WriteBuffer } from '../../persistence/write-buffer.ts'
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
	const migrationsDir = join(process.cwd(), config.migrations?.directory ?? 'migrations')
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
		} catch (err: any) {
			logger.error('Migration failed:', err?.message ?? err)
		}
	}

	// 5. Create storage and KV (lazy — will be set up in Phase 4/5)
	let storage: any = null
	let kv: any = null

	try {
		const { createStorage } = await import('../../storage/index.ts')
		storage = createStorage(config.storage)
	} catch {
		// Storage module not yet available
	}

	try {
		const { createKVStore } = await import('../../kv/index.ts')
		kv = createKVStore(sqlPool)
		await kv.ensureTable()
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
		kv,
	})

	try {
		server.start({
			port,
			hostname,
			mcp: config.mcp,
		})

		// Handle shutdown
		process.on('SIGINT', async () => {
			logger.info('Shutting down...')
			server.stop()
			await writeBuffer.shutdown()
			sqlPool.close()
			process.exit(0)
		})
	} catch (err) {
		logger.error('Failed to start server:', err)
		process.exit(1)
	}
}
