import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BunbaseConfig } from './types.ts'

export async function loadConfig(
	cwd: string = process.cwd(),
): Promise<BunbaseConfig> {
	const searchPaths = [
		'bunbase.config.ts',
		'bunbase.ts',
		'src/bunbase.config.ts',
		'src/bunbase.ts',
	]

	for (const p of searchPaths) {
		const fullPath = join(cwd, p)
		if (existsSync(fullPath)) {
			try {
				const mod = await import(fullPath)
				const config = mod.default ?? mod.config
				return config || {}
			} catch (err) {
				console.warn(`[Bunbase] Failed to load config from ${p}:`, err)
			}
		}
	}

	return {}
}
