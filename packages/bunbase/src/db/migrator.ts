import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SQL } from 'bun'

export interface MigrationEntry {
	id: number
	name: string
	applied_at: string
}

export interface MigrationPreview {
	file: string
	operations: string[]
	sql: string
}

export interface MigrationRunOptions {
	dryRun?: boolean
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
				const numA = parseInt(a.split('_')[0] || '0', 10)
				const numB = parseInt(b.split('_')[0] || '0', 10)
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
	async run(
		options?: MigrationRunOptions,
	): Promise<{ applied: string[]; skipped: string[]; preview?: MigrationPreview[] }> {
		const pending = await this.getPending()
		const applied: string[] = []
		const skipped: string[] = []

		// Dry-run mode: preview operations without executing
		if (options?.dryRun) {
			const preview: MigrationPreview[] = []

			for (const file of pending) {
				const filePath = join(this.migrationsDir, file)
				const sqlContent = await readFile(filePath, 'utf-8')
				const operations = this.parseSQLOperations(sqlContent)

				preview.push({
					file,
					operations,
					sql: sqlContent,
				})
			}

			return { applied: [], skipped: [], preview }
		}

		// Normal mode: execute migrations
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

	/**
	 * Parse SQL content to extract high-level operations.
	 * Returns a list of operation descriptions (e.g., "CREATE TABLE users", "ALTER TABLE posts ADD COLUMN").
	 */
	private parseSQLOperations(sql: string): string[] {
		const operations: string[] = []

		// Remove comments
		const cleanedSQL = sql
			.replace(/--[^\n]*/g, '') // Remove single-line comments
			.replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
			.trim()

		// Split by semicolons to get individual statements
		const statements = cleanedSQL
			.split(';')
			.map((stmt) => stmt.trim())
			.filter((stmt) => stmt.length > 0)

		for (const stmt of statements) {
			// Normalize whitespace
			const normalized = stmt.replace(/\s+/g, ' ').toUpperCase()

			// Extract operation type and target
			if (normalized.startsWith('CREATE TABLE')) {
				const match = normalized.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/)
				if (match?.[1]) {
					operations.push(`CREATE TABLE ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('ALTER TABLE')) {
				const match = normalized.match(/ALTER TABLE (\w+)/)
				if (match?.[1]) {
					const tableName = match[1].toLowerCase()
					if (normalized.includes(' ADD COLUMN ')) {
						const colMatch = normalized.match(/ ADD COLUMN (\w+)/)
						if (colMatch?.[1]) {
							operations.push(
								`ALTER TABLE ${tableName} ADD COLUMN ${colMatch[1].toLowerCase()}`,
							)
						} else {
							operations.push(`ALTER TABLE ${tableName} ADD COLUMN`)
						}
					} else if (normalized.includes(' DROP COLUMN ')) {
						const colMatch = normalized.match(/ DROP COLUMN (\w+)/)
						if (colMatch?.[1]) {
							operations.push(
								`ALTER TABLE ${tableName} DROP COLUMN ${colMatch[1].toLowerCase()}`,
							)
						} else {
							operations.push(`ALTER TABLE ${tableName} DROP COLUMN`)
						}
					} else if (normalized.includes(' RENAME COLUMN ')) {
						operations.push(`ALTER TABLE ${tableName} RENAME COLUMN`)
					} else if (normalized.includes(' ADD CONSTRAINT ')) {
						operations.push(`ALTER TABLE ${tableName} ADD CONSTRAINT`)
					} else {
						operations.push(`ALTER TABLE ${tableName}`)
					}
				}
			} else if (normalized.startsWith('DROP TABLE')) {
				const match = normalized.match(/DROP TABLE (?:IF EXISTS )?(\w+)/)
				if (match?.[1]) {
					operations.push(`DROP TABLE ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('CREATE INDEX')) {
				const match = normalized.match(/CREATE INDEX (?:\w+ )?ON (\w+)/)
				if (match?.[1]) {
					operations.push(`CREATE INDEX ON ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('DROP INDEX')) {
				const match = normalized.match(/DROP INDEX (?:IF EXISTS )?(\w+)/)
				if (match?.[1]) {
					operations.push(`DROP INDEX ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('CREATE TYPE')) {
				const match = normalized.match(/CREATE TYPE (\w+)/)
				if (match?.[1]) {
					operations.push(`CREATE TYPE ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('INSERT INTO')) {
				const match = normalized.match(/INSERT INTO (\w+)/)
				if (match?.[1]) {
					operations.push(`INSERT INTO ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('UPDATE ')) {
				const match = normalized.match(/UPDATE (\w+)/)
				if (match?.[1]) {
					operations.push(`UPDATE ${match[1].toLowerCase()}`)
				}
			} else if (normalized.startsWith('DELETE FROM')) {
				const match = normalized.match(/DELETE FROM (\w+)/)
				if (match?.[1]) {
					operations.push(`DELETE FROM ${match[1].toLowerCase()}`)
				}
			} else {
				// Generic operation
				const firstWord = normalized.split(' ')[0]
				if (firstWord) {
					operations.push(firstWord.toLowerCase())
				}
			}
		}

		return operations
	}

	/**
	 * Reset database by dropping all tables and re-running migrations.
	 * WARNING: This will delete ALL data in the database!
	 */
	async reset(): Promise<void> {
		// Drop all tables except _migrations
		const tables = await this.sql`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public'
			AND tablename != '_migrations'
		`

		await this.sql.begin(async (tx: any) => {
			// Drop all tables
			for (const { tablename } of tables) {
				await tx.unsafe(`DROP TABLE IF EXISTS "${tablename}" CASCADE`)
			}
			// Clear migrations tracking
			await tx`DELETE FROM _migrations`
		})

		// Re-run all migrations from scratch
		await this.run()
	}

	/** Create a new migration file */
	async createNew(name: string): Promise<string> {
		if (!existsSync(this.migrationsDir)) {
			await mkdir(this.migrationsDir, { recursive: true })
		}

		const available = await this.getAvailable()
		const lastFile = available[available.length - 1]
		const nextNum = lastFile
			? parseInt(lastFile.split('_')[0] || '0', 10) + 1
			: 1

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
