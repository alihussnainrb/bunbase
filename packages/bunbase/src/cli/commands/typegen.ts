import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../../config/loader.ts'
import { createSQLPool } from '../../db/pool.ts'

interface ColumnInfo {
	table_name: string
	column_name: string
	data_type: string
	udt_name: string
	is_nullable: string
	column_default: string | null
	character_maximum_length: number | null
}

interface EnumInfo {
	enum_name: string
	enum_value: string
}

interface TypegenOptions {
	schema?: string
}

/** Map PostgreSQL udt_name to TypeScript type */
function pgTypeToTs(
	udtName: string,
	enums: Map<string, string[]>,
): string {
	// Handle array types (prefixed with underscore in PostgreSQL)
	if (udtName.startsWith('_')) {
		const baseType = pgTypeToTs(udtName.slice(1), enums)
		return `${baseType}[]`
	}

	// Check enums first
	if (enums.has(udtName)) {
		const values = enums.get(udtName)!
		return values.map((v) => `'${v}'`).join(' | ')
	}

	switch (udtName) {
		case 'uuid':
		case 'text':
		case 'varchar':
		case 'char':
		case 'bpchar':
		case 'citext':
		case 'name':
			return 'string'
		case 'int2':
		case 'int4':
		case 'float4':
		case 'float8':
		case 'numeric':
		case 'money':
			return 'number'
		case 'int8':
			return 'string' // bigint as string to avoid precision loss
		case 'bool':
			return 'boolean'
		case 'json':
		case 'jsonb':
			return 'unknown'
		case 'timestamp':
		case 'timestamptz':
		case 'date':
		case 'time':
		case 'timetz':
		case 'interval':
			return 'string'
		case 'bytea':
			return 'string'
		default:
			return 'unknown'
	}
}

function generateTableType(
	tableName: string,
	columns: ColumnInfo[],
	enums: Map<string, string[]>,
	indent: string,
): string {
	const lines: string[] = []
	lines.push(`${indent}${tableName}: {`)

	// Row type — all columns with their actual types
	lines.push(`${indent}\tRow: {`)
	for (const col of columns) {
		const tsType = pgTypeToTs(col.udt_name, enums)
		const nullable = col.is_nullable === 'YES' ? ' | null' : ''
		lines.push(`${indent}\t\t${col.column_name}: ${tsType}${nullable}`)
	}
	lines.push(`${indent}\t}`)

	// Insert type — columns with defaults are optional, nullable columns are optional
	lines.push(`${indent}\tInsert: {`)
	for (const col of columns) {
		const tsType = pgTypeToTs(col.udt_name, enums)
		const nullable = col.is_nullable === 'YES' ? ' | null' : ''
		const hasDefault = col.column_default !== null
		const isNullable = col.is_nullable === 'YES'
		const optional = hasDefault || isNullable ? '?' : ''
		lines.push(`${indent}\t\t${col.column_name}${optional}: ${tsType}${nullable}`)
	}
	lines.push(`${indent}\t}`)

	// Update type — all fields optional, nullable fields keep | null
	lines.push(`${indent}\tUpdate: {`)
	for (const col of columns) {
		const tsType = pgTypeToTs(col.udt_name, enums)
		const nullable = col.is_nullable === 'YES' ? ' | null' : ''
		lines.push(`${indent}\t\t${col.column_name}?: ${tsType}${nullable}`)
	}
	lines.push(`${indent}\t}`)

	lines.push(`${indent}\tRelationships: []`)
	lines.push(`${indent}}`)

	return lines.join('\n')
}

export async function typegenCommand(opts?: TypegenOptions): Promise<void> {
	const schema = opts?.schema ?? 'public'
	const config = await loadConfig()
	const sql = createSQLPool({ url: config.database?.url })

	try {
		console.log(`Introspecting database schema "${schema}"...`)

		// Query columns
		const columns = await sql`
			SELECT
				c.table_name,
				c.column_name,
				c.data_type,
				c.udt_name,
				c.is_nullable,
				c.column_default,
				c.character_maximum_length
			FROM information_schema.columns c
			JOIN information_schema.tables t
				ON c.table_name = t.table_name AND c.table_schema = t.table_schema
			WHERE c.table_schema = ${schema}
				AND t.table_type = 'BASE TABLE'
			ORDER BY c.table_name, c.ordinal_position
		` as ColumnInfo[]

		// Query enums
		const enumRows = await sql`
			SELECT t.typname as enum_name, e.enumlabel as enum_value
			FROM pg_type t
			JOIN pg_enum e ON t.oid = e.enumtypid
			JOIN pg_namespace n ON t.typnamespace = n.oid
			WHERE n.nspname = ${schema}
			ORDER BY t.typname, e.enumsortorder
		` as EnumInfo[]

		// Group enums
		const enums = new Map<string, string[]>()
		for (const row of enumRows) {
			if (!enums.has(row.enum_name)) {
				enums.set(row.enum_name, [])
			}
			enums.get(row.enum_name)!.push(row.enum_value)
		}

		// Group columns by table
		const tables = new Map<string, ColumnInfo[]>()
		for (const col of columns) {
			if (!tables.has(col.table_name)) {
				tables.set(col.table_name, [])
			}
			tables.get(col.table_name)!.push(col)
		}

		if (tables.size === 0) {
			console.log('No tables found in the database. Nothing to generate.')
			return
		}

		// Generate output
		const tableTypes: string[] = []
		for (const [tableName, cols] of tables) {
			tableTypes.push(generateTableType(tableName, cols, enums, '\t\t\t\t\t'))
		}

		// Generate enum types section if any
		let enumSection = ''
		if (enums.size > 0) {
			const enumEntries: string[] = []
			for (const [name, values] of enums) {
				enumEntries.push(`\t\t\t\t${name}: ${values.map((v) => `'${v}'`).join(' | ')}`)
			}
			enumSection = `\n${enumEntries.join('\n')}\n\t\t\t`
		}

		const output = `// Auto-generated by \`bunbase typegen\`
// Do not edit manually — re-run \`bunbase typegen\` to regenerate.

declare module 'bunbase/db' {
	interface Database {
		public: {
			Tables: {
${tableTypes.join('\n\n')}
			}
			Views: {}
			Functions: {}
			Enums: {${enumSection}}
			Composites: {}
		}
	}
}
`

		// Write output
		const outDir = join(process.cwd(), '.bunbase')
		if (!existsSync(outDir)) {
			mkdirSync(outDir, { recursive: true })
		}

		const outPath = join(outDir, 'database.d.ts')
		await Bun.write(outPath, output)

		console.log(`Generated ${tables.size} table type(s) → .bunbase/database.d.ts`)

		if (enums.size > 0) {
			console.log(`Found ${enums.size} enum type(s)`)
		}

		console.log('')
		console.log('Make sure .bunbase is included in your tsconfig.json:')
		console.log('  "include": ["src", ".bunbase"]')
	} finally {
		sql.close()
	}
}
