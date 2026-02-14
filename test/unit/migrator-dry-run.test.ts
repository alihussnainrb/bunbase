import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SQL } from 'bun'
import { Migrator } from '../../packages/bunbase/src/db/migrator.ts'

const TEST_MIGRATIONS_DIR = join(process.cwd(), 'test-migrations-dry-run')

describe('Migrator: Dry-Run Mode', () => {
	let sql: SQL
	let migrator: Migrator

	beforeEach(async () => {
		// Create test migrations directory
		if (existsSync(TEST_MIGRATIONS_DIR)) {
			await rm(TEST_MIGRATIONS_DIR, { recursive: true })
		}
		await mkdir(TEST_MIGRATIONS_DIR, { recursive: true })

		// Initialize database connection
		const testDbUrl =
			process.env.TEST_DATABASE_URL ||
			'postgresql://postgres:postgres@localhost:5432/bunbase_test'

		sql = new SQL(testDbUrl, { max: 1 })
		migrator = new Migrator(sql, TEST_MIGRATIONS_DIR)

		// Ensure migrations table exists
		await migrator.ensureTable()

		// Clean up any existing test migrations
		await sql`DELETE FROM _migrations WHERE name LIKE '001_test_%'`
	})

	afterEach(async () => {
		// Clean up test migrations directory
		if (existsSync(TEST_MIGRATIONS_DIR)) {
			await rm(TEST_MIGRATIONS_DIR, { recursive: true })
		}

		// Close database connection
		await sql.end()
	})

	test('dry-run mode returns preview without executing', async () => {
		// Create a test migration
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_create_table.sql'),
			`
CREATE TABLE test_users (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	email VARCHAR(255) UNIQUE NOT NULL
);
`,
		)

		// Run in dry-run mode
		const result = await migrator.run({ dryRun: true })

		// Should return preview
		expect(result.preview).toBeDefined()
		expect(result.preview?.length).toBe(1)

		// Should not have applied anything
		expect(result.applied.length).toBe(0)

		// Preview should include operations
		const preview = result.preview?.[0]
		expect(preview?.file).toBe('001_test_create_table.sql')
		expect(preview?.operations).toContain('CREATE TABLE test_users')
		expect(preview?.sql).toContain('CREATE TABLE test_users')

		// Verify migration was NOT applied to database
		const applied = await migrator.getApplied()
		const wasApplied = applied.some((m) => m.name === '001_test_create_table.sql')
		expect(wasApplied).toBe(false)

		// Verify table was NOT created
		const tables = await sql`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public' AND tablename = 'test_users'
		`
		expect(tables.length).toBe(0)
	})

	test('parseSQLOperations extracts CREATE TABLE', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_operations.sql'),
			`
-- Create users table
CREATE TABLE users (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255)
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
	id SERIAL PRIMARY KEY,
	user_id INTEGER REFERENCES users(id)
);
`,
		)

		const result = await migrator.run({ dryRun: true })
		const preview = result.preview?.[0]

		expect(preview?.operations).toContain('CREATE TABLE users')
		expect(preview?.operations).toContain('CREATE TABLE posts')
	})

	test('parseSQLOperations extracts ALTER TABLE', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_alter.sql'),
			`
ALTER TABLE users ADD COLUMN age INTEGER;
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users RENAME COLUMN name TO full_name;
ALTER TABLE users ADD CONSTRAINT users_age_check CHECK (age >= 0);
`,
		)

		const result = await migrator.run({ dryRun: true })
		const preview = result.preview?.[0]

		expect(preview?.operations).toContain('ALTER TABLE users ADD COLUMN age')
		expect(preview?.operations).toContain('ALTER TABLE users DROP COLUMN email')
		expect(preview?.operations).toContain('ALTER TABLE users RENAME COLUMN')
		expect(preview?.operations).toContain('ALTER TABLE users ADD CONSTRAINT')
	})

	test('parseSQLOperations extracts DROP TABLE', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_drop.sql'),
			`
DROP TABLE users;
DROP TABLE IF EXISTS posts;
`,
		)

		const result = await migrator.run({ dryRun: true })
		const preview = result.preview?.[0]

		expect(preview?.operations).toContain('DROP TABLE users')
		expect(preview?.operations).toContain('DROP TABLE posts')
	})

	test('parseSQLOperations extracts CREATE INDEX', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_index.sql'),
			`
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX ON posts(user_id);
`,
		)

		const result = await migrator.run({ dryRun: true })
		const preview = result.preview?.[0]

		expect(preview?.operations).toContain('CREATE INDEX ON users')
		expect(preview?.operations).toContain('CREATE INDEX ON posts')
	})

	test('parseSQLOperations extracts INSERT/UPDATE/DELETE', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_data.sql'),
			`
INSERT INTO users (name, email) VALUES ('Admin', 'admin@example.com');
UPDATE users SET name = 'Administrator' WHERE email = 'admin@example.com';
DELETE FROM users WHERE email = 'test@example.com';
`,
		)

		const result = await migrator.run({ dryRun: true })
		const preview = result.preview?.[0]

		expect(preview?.operations).toContain('INSERT INTO users')
		expect(preview?.operations).toContain('UPDATE users')
		expect(preview?.operations).toContain('DELETE FROM users')
	})

	test('parseSQLOperations handles comments correctly', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_comments.sql'),
			`
-- This is a comment
CREATE TABLE users (id SERIAL);

/* Multi-line
   comment */
CREATE TABLE posts (id SERIAL);
`,
		)

		const result = await migrator.run({ dryRun: true })
		const preview = result.preview?.[0]

		// Comments should be removed from parsing
		expect(preview?.operations.length).toBe(2)
		expect(preview?.operations).toContain('CREATE TABLE users')
		expect(preview?.operations).toContain('CREATE TABLE posts')
	})

	test('dry-run with multiple migrations', async () => {
		// Create multiple test migrations
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_users.sql'),
			'CREATE TABLE users (id SERIAL);',
		)
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '002_test_posts.sql'),
			'CREATE TABLE posts (id SERIAL);',
		)
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '003_test_comments.sql'),
			'CREATE TABLE comments (id SERIAL);',
		)

		const result = await migrator.run({ dryRun: true })

		// Should preview all 3 migrations
		expect(result.preview?.length).toBe(3)
		expect(result.applied.length).toBe(0)

		// Verify none were applied
		const applied = await migrator.getApplied()
		expect(applied.length).toBe(0)
	})

	test('normal run mode still works after dry-run', async () => {
		await writeFile(
			join(TEST_MIGRATIONS_DIR, '001_test_normal.sql'),
			'CREATE TABLE test_table (id SERIAL PRIMARY KEY);',
		)

		// First do a dry-run
		const dryRunResult = await migrator.run({ dryRun: true })
		expect(dryRunResult.preview?.length).toBe(1)
		expect(dryRunResult.applied.length).toBe(0)

		// Then run normally
		const normalResult = await migrator.run()
		expect(normalResult.applied.length).toBe(1)
		expect(normalResult.applied[0]).toBe('001_test_normal.sql')

		// Verify it was actually applied
		const applied = await migrator.getApplied()
		const wasApplied = applied.some((m) => m.name === '001_test_normal.sql')
		expect(wasApplied).toBe(true)

		// Verify table was created
		const tables = await sql`
			SELECT tablename FROM pg_tables
			WHERE schemaname = 'public' AND tablename = 'test_table'
		`
		expect(tables.length).toBe(1)

		// Clean up
		await sql`DROP TABLE test_table`
		await sql`DELETE FROM _migrations WHERE name = '001_test_normal.sql'`
	})

	test('dry-run returns empty preview when no pending migrations', async () => {
		// No migration files created
		const result = await migrator.run({ dryRun: true })

		expect(result.preview).toBeDefined()
		expect(result.preview?.length).toBe(0)
		expect(result.applied.length).toBe(0)
	})
})
