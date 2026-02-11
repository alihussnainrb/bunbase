import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { ActionRegistry } from '../../core/registry.ts'
import { Logger } from '../../logger/index.ts'
import { WriteBuffer } from '../../persistence/write-buffer.ts'
import { loadActions } from '../../runtime/loader.ts'
import { BunbaseServer } from '../../runtime/server.ts'

export async function devCommand(): Promise<void> {
	// 1. Load config
	const config = await loadConfig()
	const port = config.port ?? 3000
	const hostname = config.hostname ?? '0.0.0.0'

	// Default actions dir: src/actions if exists, else src, else .
	// But usually people put actions in src/actions or src/modules
	// Let's default to 'src' to be safe and scan recursively
	const actionsDir = config.actionsDir ?? 'src'

	const logger = new Logger({
		level: 'debug',
	})

	const writeBuffer = new WriteBuffer({
		enabled: config.persistence?.enabled ?? true,
		flushIntervalMs: config.persistence?.flushIntervalMs,
		maxBufferSize: config.persistence?.maxBufferSize,
	})

	const registry = new ActionRegistry()

	logger.info('Starting Bunbase in development mode...')
	logger.info(`Scanning for actions in: ${actionsDir}`)

	// 2. Load actions
	const startLoad = performance.now()
	await loadActions(actionsDir, registry, logger)
	const loadDuration = (performance.now() - startLoad).toFixed(2)
	logger.info(`Loaded ${registry.size} actions in ${loadDuration}ms`)

	// 3. Start server
	const server = new BunbaseServer(registry, logger, writeBuffer, config)

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
			process.exit(0)
		})
	} catch (err) {
		logger.error('Failed to start server:', err)
		process.exit(1)
	}
}
