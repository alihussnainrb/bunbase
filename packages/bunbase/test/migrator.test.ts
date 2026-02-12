import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Migrator } from '../src/db/migrator.ts'

// Mock SQL implementation for testing
function createMockSQL() {
	const migrations = new Map<
		string,
		{ id: number; name: string; applied_at: Date }
	>()
	let idCounter = 1

	const mockSQL: any = async (
		strings: TemplateStringsArray,
		...values: any[]
	) => {
		const query = strings.join('?')

		// CREATE TABLE _migrations
		if (query.includes('CREATE TABLE IF NOT EXISTS _migrations')) {
			return []
		}

		// SELECT migrations
		if (query.includes('SELECT id, name, applied_at FROM _migrations')) {
			return Array.from(migrations.values()).sort((a, b) => a.id - b.id)
		}

		// INSERT migration
		if (query.includes('INSERT INTO _migrations')) {
			const name = values[0]
			migrations.set(name, {
				id: idCounter++,
				name,
				applied_at: new Date(),
			})
			return []
		}

		return []
	}

	// Add begin method for transactions
	mockSQL.begin = async (callback: (tx: any) => Promise<void>) => {
		// Create transaction SQL function that supports template literals
		const tx: any = async (strings: TemplateStringsArray, ...values: any[]) => {
			return mockSQL(strings, ...values)
		}
		tx.unsafe = async (_sql: string) => {
			// Simulate executing raw SQL
			return []
		}
		await callback(tx)
	}

	return mockSQL
}

describe('Migrator', () => {
	const testDir = join(process.cwd(), '.test-migrations')
	let migrator: Migrator
	let mockSQL: any

	beforeEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true })
		}
		mkdirSync(testDir, { recursive: true })

		mockSQL = createMockSQL()
		migrator = new Migrator(mockSQL, testDir)
	})

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true })
		}
	})

	describe('ensureTable()', () => {
		it('should create _migrations table', async () => {
			await expect(migrator.ensureTable()).resolves.toBeUndefined()
		})
	})

	describe('getApplied()', () => {
		it('should return empty array when no migrations applied', async () => {
			const applied = await migrator.getApplied()
			expect(applied).toEqual([])
		})

		it('should return applied migrations in order', async () => {
			// Simulate applying migrations
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'001_init.sql'})`
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'002_add_users.sql'})`

			const applied = await migrator.getApplied()
			expect(applied.length).toBe(2)
			expect(applied[0]?.name).toBe('001_init.sql')
			expect(applied[1]?.name).toBe('002_add_users.sql')
		})
	})

	describe('getAvailable()', () => {
		it('should return empty array when no migration files exist', async () => {
			const available = await migrator.getAvailable()
			expect(available).toEqual([])
		})

		it('should return migration files sorted by prefix', async () => {
			writeFileSync(join(testDir, '003_add_posts.sql'), 'CREATE TABLE posts;')
			writeFileSync(join(testDir, '001_init.sql'), 'CREATE TABLE users;')
			writeFileSync(
				join(testDir, '002_add_comments.sql'),
				'CREATE TABLE comments;',
			)

			const available = await migrator.getAvailable()
			expect(available).toEqual([
				'001_init.sql',
				'002_add_comments.sql',
				'003_add_posts.sql',
			])
		})

		it('should ignore non-SQL files', async () => {
			writeFileSync(join(testDir, '001_init.sql'), 'SQL')
			writeFileSync(join(testDir, 'README.md'), 'Docs')
			writeFileSync(join(testDir, 'script.ts'), 'TS')

			const available = await migrator.getAvailable()
			expect(available).toEqual(['001_init.sql'])
		})
	})

	describe('getPending()', () => {
		beforeEach(() => {
			writeFileSync(join(testDir, '001_init.sql'), 'CREATE TABLE users;')
			writeFileSync(join(testDir, '002_add_posts.sql'), 'CREATE TABLE posts;')
			writeFileSync(
				join(testDir, '003_add_comments.sql'),
				'CREATE TABLE comments;',
			)
		})

		it('should return all migrations when none applied', async () => {
			const pending = await migrator.getPending()
			expect(pending.length).toBe(3)
		})

		it('should return only unapplied migrations', async () => {
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'001_init.sql'})`

			const pending = await migrator.getPending()
			expect(pending).toEqual(['002_add_posts.sql', '003_add_comments.sql'])
		})

		it('should return empty array when all applied', async () => {
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'001_init.sql'})`
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'002_add_posts.sql'})`
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'003_add_comments.sql'})`

			const pending = await migrator.getPending()
			expect(pending).toEqual([])
		})
	})

	describe('run()', () => {
		it('should apply pending migrations', async () => {
			writeFileSync(join(testDir, '001_init.sql'), 'CREATE TABLE users;')
			writeFileSync(join(testDir, '002_add_posts.sql'), 'CREATE TABLE posts;')

			const result = await migrator.run()
			expect(result.applied).toEqual(['001_init.sql', '002_add_posts.sql'])
			expect(result.skipped).toEqual([])
		})

		it('should skip already applied migrations', async () => {
			writeFileSync(join(testDir, '001_init.sql'), 'CREATE TABLE users;')
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'001_init.sql'})`

			const result = await migrator.run()
			expect(result.applied).toEqual([])
		})

		it('should return empty result when no pending migrations', async () => {
			const result = await migrator.run()
			expect(result.applied).toEqual([])
			expect(result.skipped).toEqual([])
		})
	})

	describe('createNew()', () => {
		it('should create first migration with 001 prefix', async () => {
			const fileName = await migrator.createNew('init')
			expect(fileName).toMatch(/^001_init\.sql$/)
			expect(existsSync(join(testDir, fileName))).toBe(true)
		})

		it('should increment prefix for subsequent migrations', async () => {
			writeFileSync(join(testDir, '001_init.sql'), 'SQL')
			writeFileSync(join(testDir, '002_users.sql'), 'SQL')

			const fileName = await migrator.createNew('add_posts')
			expect(fileName).toMatch(/^003_add_posts\.sql$/)
		})

		it('should convert CamelCase to snake_case', async () => {
			const fileName = await migrator.createNew('addUserTable')
			expect(fileName).toMatch(/^001_add_user_table\.sql$/)
		})

		it('should handle spaces and dashes', async () => {
			const fileName = await migrator.createNew('add user-table')
			expect(fileName).toMatch(/^001_add_user_table\.sql$/)
		})

		it('should create migrations directory if it does not exist', async () => {
			rmSync(testDir, { recursive: true, force: true })

			const fileName = await migrator.createNew('init')
			expect(existsSync(testDir)).toBe(true)
			expect(existsSync(join(testDir, fileName))).toBe(true)
		})
	})

	describe('status()', () => {
		beforeEach(() => {
			writeFileSync(join(testDir, '001_init.sql'), 'CREATE TABLE users;')
			writeFileSync(join(testDir, '002_add_posts.sql'), 'CREATE TABLE posts;')
			writeFileSync(
				join(testDir, '003_add_comments.sql'),
				'CREATE TABLE comments;',
			)
		})

		it('should return status of all migrations', async () => {
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'001_init.sql'})`

			const status = await migrator.status()
			expect(status.length).toBe(3)
			expect(status[0]?.status).toBe('applied')
			expect(status[1]?.status).toBe('pending')
			expect(status[2]?.status).toBe('pending')
		})

		it('should include applied_at timestamp for applied migrations', async () => {
			await mockSQL`INSERT INTO _migrations (name) VALUES (${'001_init.sql'})`

			const status = await migrator.status()
			expect(status[0]?.appliedAt).toBeDefined()
			expect(status[1]?.appliedAt).toBeUndefined()
		})
	})
})
