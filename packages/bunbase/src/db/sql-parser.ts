/**
 * Parse SQL statements and generate automatic rollback logic.
 * Supports common DDL operations for PostgreSQL migrations.
 */

interface SQLStatement {
	type: 'CREATE_TABLE' | 'ALTER_TABLE' | 'CREATE_INDEX' | 'DROP_TABLE' | 'DROP_INDEX' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UNKNOWN'
	original: string
	tableName?: string
	indexName?: string
	columnName?: string
	constraintName?: string
}

/**
 * Split SQL file into individual statements.
 * Handles semicolons inside strings and comments.
 */
function parseSQLStatements(sql: string): string[] {
	const statements: string[] = []
	let current = ''
	let inString = false
	let stringChar = ''
	let inComment = false

	for (let i = 0; i < sql.length; i++) {
		const char = sql[i]
		const nextChar = sql[i + 1]

		// Handle comments
		if (!inString && char === '-' && nextChar === '-') {
			inComment = true
			current += char
			continue
		}

		if (inComment && char === '\n') {
			inComment = false
			current += char
			continue
		}

		if (inComment) {
			current += char
			continue
		}

		// Handle strings
		if ((char === "'" || char === '"') && !inString) {
			inString = true
			stringChar = char
			current += char
			continue
		}

		if (char === stringChar && inString) {
			inString = false
			current += char
			continue
		}

		// Handle semicolons (statement separator)
		if (char === ';' && !inString && !inComment) {
			current += char
			const trimmed = current.trim()
			if (trimmed) {
				statements.push(trimmed)
			}
			current = ''
			continue
		}

		current += char
	}

	// Add final statement if exists
	const trimmed = current.trim()
	if (trimmed && !trimmed.startsWith('--')) {
		statements.push(trimmed)
	}

	return statements
}

/**
 * Analyze SQL statement and determine its type and metadata.
 */
function analyzeStatement(sql: string): SQLStatement {
	const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase()

	// CREATE TABLE
	const createTableMatch = normalized.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/)
	if (createTableMatch && createTableMatch[1]) {
		return {
			type: 'CREATE_TABLE',
			original: sql,
			tableName: createTableMatch[1].toLowerCase(),
		}
	}

	// ALTER TABLE ADD COLUMN
	const alterAddColumnMatch = normalized.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)/)
	if (alterAddColumnMatch && alterAddColumnMatch[1] && alterAddColumnMatch[2]) {
		return {
			type: 'ALTER_TABLE',
			original: sql,
			tableName: alterAddColumnMatch[1].toLowerCase(),
			columnName: alterAddColumnMatch[2].toLowerCase(),
		}
	}

	// ALTER TABLE ADD CONSTRAINT
	const alterAddConstraintMatch = normalized.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)/)
	if (alterAddConstraintMatch && alterAddConstraintMatch[1] && alterAddConstraintMatch[2]) {
		return {
			type: 'ALTER_TABLE',
			original: sql,
			tableName: alterAddConstraintMatch[1].toLowerCase(),
			constraintName: alterAddConstraintMatch[2].toLowerCase(),
		}
	}

	// CREATE INDEX
	const createIndexMatch = normalized.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)/)
	if (createIndexMatch && createIndexMatch[1] && createIndexMatch[2]) {
		return {
			type: 'CREATE_INDEX',
			original: sql,
			indexName: createIndexMatch[1].toLowerCase(),
			tableName: createIndexMatch[2].toLowerCase(),
		}
	}

	// DROP TABLE
	if (normalized.includes('DROP TABLE')) {
		return {
			type: 'DROP_TABLE',
			original: sql,
		}
	}

	// DROP INDEX
	if (normalized.includes('DROP INDEX')) {
		return {
			type: 'DROP_INDEX',
			original: sql,
		}
	}

	// INSERT
	if (normalized.startsWith('INSERT INTO')) {
		return {
			type: 'INSERT',
			original: sql,
		}
	}

	// UPDATE
	if (normalized.startsWith('UPDATE')) {
		return {
			type: 'UPDATE',
			original: sql,
		}
	}

	// DELETE
	if (normalized.startsWith('DELETE')) {
		return {
			type: 'DELETE',
			original: sql,
		}
	}

	return {
		type: 'UNKNOWN',
		original: sql,
	}
}

/**
 * Generate rollback statement for a given SQL statement.
 * Returns null if rollback cannot be auto-generated.
 */
function generateRollbackStatement(stmt: SQLStatement): string | null {
	switch (stmt.type) {
		case 'CREATE_TABLE':
			return `DROP TABLE IF EXISTS ${stmt.tableName} CASCADE;`

		case 'ALTER_TABLE':
			if (stmt.columnName) {
				return `ALTER TABLE ${stmt.tableName} DROP COLUMN IF EXISTS ${stmt.columnName};`
			}
			if (stmt.constraintName) {
				return `ALTER TABLE ${stmt.tableName} DROP CONSTRAINT IF EXISTS ${stmt.constraintName};`
			}
			return null

		case 'CREATE_INDEX':
			return `DROP INDEX IF EXISTS ${stmt.indexName};`

		case 'DROP_TABLE':
		case 'DROP_INDEX':
		case 'INSERT':
		case 'UPDATE':
		case 'DELETE':
			// Cannot auto-generate rollback for destructive operations
			return null

		default:
			return null
	}
}

/**
 * Generate rollback SQL for a complete migration.
 * Returns null if any statement cannot be rolled back automatically.
 *
 * @example
 * ```typescript
 * const migrationSql = `
 *   CREATE TABLE users (id SERIAL PRIMARY KEY);
 *   CREATE INDEX idx_users_email ON users(email);
 * `
 * const rollback = generateRollback(migrationSql)
 * // Returns:
 * // DROP INDEX IF EXISTS idx_users_email;
 * // DROP TABLE IF EXISTS users CASCADE;
 * ```
 */
export function generateRollback(sql: string): string | null {
	const statements = parseSQLStatements(sql)
	const rollbackStatements: string[] = []

	for (const stmtText of statements) {
		// Skip comments and empty lines
		if (stmtText.trim().startsWith('--') || !stmtText.trim()) {
			continue
		}

		const stmt = analyzeStatement(stmtText)
		const rollback = generateRollbackStatement(stmt)

		if (rollback === null) {
			// Cannot auto-generate rollback for this statement
			// Return null to indicate manual rollback required
			return null
		}

		rollbackStatements.push(rollback)
	}

	// Reverse order: last operation rolls back first
	return rollbackStatements.reverse().join('\n')
}

/**
 * Calculate SHA-256 checksum of migration content for integrity verification.
 */
export async function calculateChecksum(content: string): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(content)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
