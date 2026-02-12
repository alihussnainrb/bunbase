import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQL } from 'bun'

export interface MigrationEntry {
	id: number
	name: string
	applied_at: string
}

export class Migrator {
	constructor(
		private readonly sql: SQL,
		private readonly migrationsDir: string,
	) {}

	/** Ensure the _migrations tracking table exists */
	async ensureTable(): Promise<void> {
		await this.sql`
			CREATE TABLE IF NOT EXISTS _migrations (
				id SERIAL PRIMARY KEY,
				name VARCHAR(255) UNIQUE NOT NULL,
				applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`
	}

	/** Get list of already-applied migration names */
	async getApplied(): Promise<MigrationEntry[]> {
		await this.ensureTable()
		const rows = await this.sql`
			SELECT id, name, applied_at FROM _migrations ORDER BY id ASC
		`
		return rows as MigrationEntry[]
	}

	/** Get all migration SQL files from disk, sorted by prefix number */
	async getAvailable(): Promise<string[]> {
		if (!existsSync(this.migrationsDir)) return []
		const files = await readdir(this.migrationsDir)
		return files
			.filter((f) => f.endsWith('.sql'))
			.sort((a, b) => {
				const numA = parseInt(a.split('_')[0]!, 10)
				const numB = parseInt(b.split('_')[0]!, 10)
				return numA - numB
			})
	}

	/** Get pending migrations (available but not yet applied) */
	async getPending(): Promise<string[]> {
		const applied = await this.getApplied()
		const appliedNames = new Set(applied.map((m) => m.name))
		const available = await this.getAvailable()
		return available.filter((f) => !appliedNames.has(f))
	}

	/** Run all pending migrations in order */
	async run(): Promise<{ applied: string[]; skipped: string[] }> {
		const pending = await this.getPending()
		const applied: string[] = []
		const skipped: string[] = []

		for (const file of pending) {
			const filePath = join(this.migrationsDir, file)
			const sqlContent = await readFile(filePath, 'utf-8')

			try {
				// Run migration in a transaction
				await this.sql.begin(async (tx: any) => {
					await tx.unsafe(sqlContent)
					await tx`INSERT INTO _migrations (name) VALUES (${file})`
				})
				applied.push(file)
			} catch (err) {
				throw new Error(
					`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}

		return { applied, skipped }
	}

	/** Create a new migration file */
	async createNew(name: string): Promise<string> {
		if (!existsSync(this.migrationsDir)) {
			await mkdir(this.migrationsDir, { recursive: true })
		}

		const available = await this.getAvailable()
		const lastFile = available[available.length - 1]
		const nextNum = lastFile ? parseInt(lastFile.split('_')[0]!, 10) + 1 : 1

		const paddedNum = String(nextNum).padStart(3, '0')
		const kebabName = name
			.replace(/([a-z])([A-Z])/g, '$1_$2')
			.replace(/[\s\-.]+/g, '_')
			.toLowerCase()
		const fileName = `${paddedNum}_${kebabName}.sql`
		const filePath = join(this.migrationsDir, fileName)

		await writeFile(
			filePath,
			`-- Migration: ${name}\n-- Created at: ${new Date().toISOString()}\n\n`,
		)
		return fileName
	}

	/** Get status of all migrations */
	async status(): Promise<
		Array<{ name: string; status: 'applied' | 'pending'; appliedAt?: string }>
	> {
		const applied = await this.getApplied()
		const appliedMap = new Map(applied.map((m) => [m.name, m.applied_at]))
		const available = await this.getAvailable()

		return available.map((file) => ({
			name: file,
			status: appliedMap.has(file)
				? ('applied' as const)
				: ('pending' as const),
			appliedAt: appliedMap.get(file),
		}))
	}
}
