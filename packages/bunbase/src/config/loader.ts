import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BunbaseConfig } from './types.ts'
import {
	validateConfig,
	isConfigValidationError,
} from './validator.ts'

export async function loadConfig(
	cwd: string = process.cwd(),
): Promise<BunbaseConfig> {
	const searchPaths = [
		'bunbase.config.ts',
		'bunbase.ts',
		'src/bunbase.config.ts',
		'src/bunbase.ts',
	]

	let rawConfig: unknown = {}
	let configPath: string | null = null

	for (const p of searchPaths) {
		const fullPath = join(cwd, p)
		if (existsSync(fullPath)) {
			try {
				const mod = await import(fullPath)
				rawConfig = mod.default ?? mod.config ?? {}
				configPath = p
				break
			} catch (err) {
				console.warn(`[Bunbase] Failed to load config from ${p}:`, err)
			}
		}
	}

	// Validate config with Zod
	try {
		return validateConfig(rawConfig)
	} catch (err) {
		if (isConfigValidationError(err)) {
			console.error('\n❌ Configuration validation failed\n')
			if (configPath) {
				console.error(`Config file: ${configPath}\n`)
			}
			console.error(err.format())
			console.error(
				'\nFix the errors above and restart the server.\n',
			)
			process.exit(1)
		}
		throw err
	}
}
