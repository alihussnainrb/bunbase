import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQL } from 'bun'
import { createDB } from './client.ts'
import type { SeedDefinition } from './seed.ts'
import { executeSeed } from './seed.ts'
import { Logger } from '../logger/index.ts'

export interface SeedEntry {
	id: number
	name: string
	seeded_at: string
}

export interface SeedFunction {
	(sql: SQL): Promise<void>
}

/**
 * Database seeder for populating databases with initial/test data.
 * Supports both .sql and .ts seed files.
 */
export class Seeder {
	private logger: Logger

	constructor(
		private readonly sql: SQL,
		private readonly seedsDir: string,
		logger?: Logger,
	) {
		this.logger = logger ?? new Logger({ level: 'info' })
	}

	/** Ensure the _seeds tracking table exists (optional - for tracking seed history) */
	async ensureTable(): Promise<void> {
		await this.sql`
			CREATE TABLE IF NOT EXISTS _seeds (
				id SERIAL PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`
	}

	/** Get list of already-run seed names */
	async getSeeded(): Promise<SeedEntry[]> {
		await this.ensureTable()
		const rows = await this.sql`
			SELECT id, name, seeded_at FROM _seeds ORDER BY id ASC
		`
		return rows as SeedEntry[]
	}

	/** Get all seed files from disk, sorted by prefix number */
	async getAvailable(): Promise<string[]> {
		if (!existsSync(this.seedsDir)) return []
		const files = await readdir(this.seedsDir)
		return files
			.filter((f) => f.endsWith('.sql') || f.endsWith('.seed.ts'))
			.sort((a, b) => {
				const numA = Number.parseInt(a.split('_')[0] || '0', 10)
				const numB = Number.parseInt(b.split('_')[0] || '0', 10)
				return numA - numB
			})
	}

	/** Get pending seeds (available but not yet run - only relevant if tracking is enabled) */
	async getPending(): Promise<string[]> {
		const seeded = await this.getSeeded()
		const seededNames = new Set(seeded.map((s) => s.name))
		const available = await this.getAvailable()
		return available.filter((f) => !seededNames.has(f))
	}

	/**
	 * Run all seed files.
	 * By default, seeds are idempotent and can be re-run.
	 * Pass trackSeeds=true to track which seeds have been run.
	 */
	async run(options?: {
		trackSeeds?: boolean
		fresh?: boolean
	}): Promise<{ seeded: string[] }> {
		const { trackSeeds = false, fresh = false } = options ?? {}

		// If fresh=true, clear existing seed tracking
		if (fresh && trackSeeds) {
			await this.ensureTable()
			await this.sql`DELETE FROM _seeds`
		}

		const seeds = trackSeeds ? await this.getPending() : await this.getAvailable()
		const seeded: string[] = []

		for (const file of seeds) {
			const filePath = join(this.seedsDir, file)

			try {
				if (file.endsWith('.sql')) {
					// SQL seed file
					const sqlContent = await readFile(filePath, 'utf-8')
					await this.sql.begin(async (tx: any) => {
						await tx.unsafe(sqlContent)
						if (trackSeeds) {
							await tx`INSERT INTO _seeds (name) VALUES (${file})`
						}
					})
				} else if (file.endsWith('.seed.ts')) {
					// TypeScript seed file
					const seedModule = await import(filePath)
					const exported = seedModule.default || seedModule.seed

					if (!exported) {
						throw new Error(
							`Seed file ${file} must export a default or named 'seed' export`,
						)
					}

					await this.sql.begin(async (tx: any) => {
						// Check if it's a SeedDefinition (with config + handler)
						if (
							typeof exported === 'object' &&
							'config' in exported &&
							'handler' in exported
						) {
							// New seed() format with context
							const definition = exported as SeedDefinition
							await executeSeed(definition, tx, this.logger)
						} else if (typeof exported === 'function') {
							// Legacy function format
							const seedFn = exported as SeedFunction
							await seedFn(tx)
						} else {
							throw new Error(
								`Seed file ${file} must export a function or seed() definition`,
							)
						}

						if (trackSeeds) {
							await tx`INSERT INTO _seeds (name) VALUES (${file})`
						}
					})
				}

				seeded.push(file)
			} catch (err) {
				throw new Error(
					`Seed ${file} failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		return { seeded }
	}

	/**
	 * Clear all seed tracking.
	 * This does NOT undo the data changes - seeds should be idempotent.
	 */
	async clear(): Promise<void> {
		await this.ensureTable()
		await this.sql`DELETE FROM _seeds`
	}

	/**
	 * Create a new seed file.
	 * Creates either a .sql or .seed.ts file based on the type parameter.
	 */
	async createNew(
		name: string,
		type: 'sql' | 'ts' = 'ts',
	): Promise<string> {
		if (!existsSync(this.seedsDir)) {
			await mkdir(this.seedsDir, { recursive: true })
		}

		const available = await this.getAvailable()
		const lastFile = available[available.length - 1]
		const nextNum = lastFile
			? Number.parseInt(lastFile.split('_')[0] || '0', 10) + 1
			: 1

		const paddedNum = String(nextNum).padStart(3, '0')
		const kebabName = name
			.replace(/([a-z])([A-Z])/g, '$1_$2')
			.replace(/[\s\-.]+/g, '_')
			.toLowerCase()

		if (type === 'sql') {
			const fileName = `${paddedNum}_${kebabName}.sql`
			const filePath = join(this.seedsDir, fileName)

			await writeFile(
				filePath,
				`-- Seed: ${name}\n-- Created at: ${new Date().toISOString()}\n\n`,
			)
			return fileName
		}

		// TypeScript seed
		const fileName = `${paddedNum}_${kebabName}.seed.ts`
		const filePath = join(this.seedsDir, fileName)

		await writeFile(
			filePath,
			`import { seed } from 'bunbase'

/**
 * Seed: ${name}
 * Created at: ${new Date().toISOString()}
 */
export default seed({
	name: '${kebabName}',
	description: '${name}',
}, async ({ db, logger }) => {
	// Example: Insert seed data
	// await db.from('users').insert({
	//   email: 'admin@example.com',
	//   name: 'Admin User',
	// }).exec()

	logger.info('Seeded: ${name}')
})
`,
		)
		return fileName
	}

	/** Get status of all seeds (only relevant if tracking is enabled) */
	async status(): Promise<
		Array<{ name: string; status: 'seeded' | 'pending'; seededAt?: string }>
	> {
		const seeded = await this.getSeeded()
		const seededMap = new Map(seeded.map((s) => [s.name, s.seeded_at]))
		const available = await this.getAvailable()

		return available.map((file) => ({
			name: file,
			status: seededMap.has(file)
				? ('seeded' as const)
				: ('pending' as const),
			seededAt: seededMap.get(file),
		}))
	}
}
