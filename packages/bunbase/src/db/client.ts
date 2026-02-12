// src/db/client.ts

import type { SQL } from 'bun'
import { getSQLPool } from './pool.ts'
import { setRLSContext } from './session-vars.ts'

/**
 * Typed DB client — generic over your Database schema
 */


// type Database = {
// 	public: {
// 		Tables: {
// 			[key: string]: TableDef
// 		}
// 	}
// }

interface TableDef {
	Row: Record<string, any>
	Insert: Record<string, any>
	Update: Record<string, any>
	Relationships: any[]
}

/**
 * Type registration interface. Augment this via `bunbase typegen` to get
 * automatic type inference without passing generics.
 *
 * @example
 * // .bunbase/database.d.ts (auto-generated)
 * declare module 'bunbase/db' {
 *   interface Database {
 *     public: { Tables: { ... } }
 *   }
 * }
 */
export interface Database {
	public: {
		Tables: {
			[key: string]: TableDef
		}
	}
}



type InferTables<DB extends Database> = DB['public']['Tables']

type InferTable<
	DB extends Database,
	T extends keyof InferTables<DB>,
> = InferTables<DB>[T]

export type DatabaseClient<DB extends Database = Database> = {
	from<T extends keyof InferTables<DB> & string>(
		table: T,
	): TypedQueryBuilder<InferTable<DB, T>>

	raw: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>
}

// type ResolvedDatabase = BunbaseDBRegister extends {
// 	database: infer DB extends Database
// }
// 	? DB
// 	: Database

// type InferTables<DB extends Database> = DB['public']['Tables']

// type InferTable<
// 	DB extends Database,
// 	T extends keyof InferTables<DB>,
// > = InferTables<DB>[T]

// export type DatabaseClient<DB extends Database = Database> = {
// 	from: <T extends keyof InferTables<DB>>(
// 		table: T,
// 	) => TypedQueryBuilder<InferTable<DB, T>>

// 	raw: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>
// 	// transaction: <T>(cb: (tx: DatabaseClient<DB>) => Promise<T>) => Promise<T>
// }

export function createDB<DB extends Database = Database>(sql?: SQL): DatabaseClient<DB> {
	type Tables = InferTables<DB>
	const pool = sql ?? getSQLPool()

	return {
		from: <T extends keyof Tables & string>(table: T) =>
			new TypedQueryBuilder<Tables[T]>(table, pool) as any,

		raw: (strings: TemplateStringsArray, ...values: any[]) =>
			pool(strings, ...values),
	}
}

class TypedQueryBuilder<Table extends TableDef> {
	private table: string
	private sql: SQL
	private selects: (keyof Table['Row'])[] | ['*'] = ['*']
	private wheres: Array<{ col: keyof Table['Row']; op: string; val: any }> = []
	private limitNum: number | null = null
	private offsetNum: number | null = null
	private orderByCol: keyof Table['Row'] | null = null
	private orderByDir: 'ASC' | 'DESC' = 'ASC'
	private returningFields: (keyof Table['Row'])[] | null = null

	constructor(table: string, sql: SQL) {
		this.table = table
		this.sql = sql
	}

	select<
		Fields extends keyof Table['Row'] | '*',
		Result = Fields extends '*'
		? Table['Row']
		: Pick<Table['Row'], Fields extends keyof Table['Row'] ? Fields : never>,
	>(
		...fields: Fields[]
	): TypedQueryBuilder<Table> & { exec: () => Promise<Result[]> } {
		this.selects = (fields.length ? fields : ['*']) as any
		return this as any
	}

	eq<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
		this.wheres.push({ col: column, op: '=', val: value })
		return this
	}

	neq<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
		this.wheres.push({ col: column, op: '!=', val: value })
		return this
	}

	gt<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
		this.wheres.push({ col: column, op: '>', val: value })
		return this
	}

	gte<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
		this.wheres.push({ col: column, op: '>=', val: value })
		return this
	}

	lt<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
		this.wheres.push({ col: column, op: '<', val: value })
		return this
	}

	lte<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
		this.wheres.push({ col: column, op: '<=', val: value })
		return this
	}

	like<K extends keyof Table['Row']>(column: K, pattern: string): this {
		this.wheres.push({ col: column, op: 'LIKE', val: pattern })
		return this
	}

	ilike<K extends keyof Table['Row']>(column: K, pattern: string): this {
		this.wheres.push({ col: column, op: 'ILIKE', val: pattern })
		return this
	}

	isNull<K extends keyof Table['Row']>(column: K): this {
		this.wheres.push({ col: column, op: 'IS NULL', val: null })
		return this
	}

	isNotNull<K extends keyof Table['Row']>(column: K): this {
		this.wheres.push({ col: column, op: 'IS NOT NULL', val: null })
		return this
	}

	in<K extends keyof Table['Row']>(column: K, values: Table['Row'][K][]): this {
		this.wheres.push({ col: column, op: 'IN', val: values })
		return this
	}

	limit(n: number): this {
		this.limitNum = n
		return this
	}

	offset(n: number): this {
		this.offsetNum = n
		return this
	}

	orderBy<K extends keyof Table['Row']>(column: K, direction: 'ASC' | 'DESC' = 'ASC'): this {
		this.orderByCol = column
		this.orderByDir = direction
		return this
	}

	returning<Fields extends keyof Table['Row']>(fields: Fields[]): this {
		this.returningFields = fields
		return this
	}

	async single(ctx?: { session?: any }): Promise<Table['Row'] | null> {
		const rows = await this.limit(1).exec(ctx)
		return rows[0] ?? null
	}

	async maybeSingle(ctx?: { session?: any }): Promise<Table['Row'] | null> {
		const rows = await this.limit(1).exec(ctx)
		if (rows.length > 1) return null
		return rows[0] ?? null
	}

	async count(ctx?: { session?: any }): Promise<number> {
		if (ctx) await setRLSContext(this.sql, ctx)

		let query = this.sql`SELECT COUNT(*) as count FROM ${this.sql(this.table)}`

		if (this.wheres.length > 0) {
			const whereClause = this.buildWhereClause()
			query = this.sql`${query} WHERE ${whereClause}`
		}

		const result = await query
		return Number(result[0]?.count ?? 0)
	}

	private buildWhereClause() {
		const conditions = this.wheres.map((w) => {
			if (w.op === 'IN') {
				return this.sql`${this.sql(w.col)} IN (${this.sql(w.val)})`
			}
			if (w.op === 'IS NULL') {
				return this.sql`${this.sql(w.col)} IS NULL`
			}
			if (w.op === 'IS NOT NULL') {
				return this.sql`${this.sql(w.col)} IS NOT NULL`
			}
			const op = this.sql.unsafe(w.op)
			return this.sql`${this.sql(w.col)} ${op} ${w.val}`
		})

		return conditions.reduce((acc, curr, i) => {
			if (i === 0) return curr
			return this.sql`${acc} AND ${curr}`
		}, this.sql``)
	}

	async exec(ctx?: { session?: any }): Promise<Table['Row'][]> {
		if (ctx) await setRLSContext(this.sql, ctx)

		let query = this.sql`SELECT ${this.sql(this.selects)} FROM ${this.sql(this.table)}`

		if (this.wheres.length > 0) {
			const whereClause = this.buildWhereClause()
			query = this.sql`${query} WHERE ${whereClause}`
		}

		if (this.orderByCol !== null) {
			const dir = this.sql.unsafe(this.orderByDir)
			query = this.sql`${query} ORDER BY ${this.sql(this.orderByCol)} ${dir}`
		}

		if (this.limitNum !== null) {
			query = this.sql`${query} LIMIT ${this.limitNum}`
		}

		if (this.offsetNum !== null) {
			query = this.sql`${query} OFFSET ${this.offsetNum}`
		}

		const result = await query
		return result as Table['Row'][]
	}

	async insert(
		data: Table['Insert'],
		ctx?: { session?: any },
	): Promise<Table['Row'] | null> {
		if (ctx) await setRLSContext(this.sql, ctx)

		let q = this.sql`INSERT INTO ${this.sql(this.table)} ${this.sql(data)}`

		if (this.returningFields) {
			q = this.sql`${q} RETURNING ${this.sql(this.returningFields)}`
		} else {
			q = this.sql`${q} RETURNING *`
		}

		const result = await q
		return (result[0] as Table['Row']) ?? null
	}

	async update(
		data: Table['Update'],
		ctx?: { session?: any },
	): Promise<Table['Row'][]> {
		if (ctx) await setRLSContext(this.sql, ctx)

		let q = this.sql`UPDATE ${this.sql(this.table)} SET ${this.sql(data)}`

		if (this.wheres.length > 0) {
			const whereClause = this.buildWhereClause()
			q = this.sql`${q} WHERE ${whereClause}`
		}

		if (this.returningFields) {
			q = this.sql`${q} RETURNING ${this.sql(this.returningFields)}`
		} else {
			q = this.sql`${q} RETURNING *`
		}

		const result = await q
		return result as Table['Row'][]
	}

	async delete(ctx?: { session?: any }): Promise<Table['Row'][]> {
		if (ctx) await setRLSContext(this.sql, ctx)

		let q = this.sql`DELETE FROM ${this.sql(this.table)}`

		if (this.wheres.length > 0) {
			const whereClause = this.buildWhereClause()
			q = this.sql`${q} WHERE ${whereClause}`
		}

		if (this.returningFields) {
			q = this.sql`${q} RETURNING ${this.sql(this.returningFields)}`
		} else {
			q = this.sql`${q} RETURNING *`
		}

		const result = await q
		return result as Table['Row'][]
	}
}
