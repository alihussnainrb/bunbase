// src/db/client.ts

import type { SQL } from 'bun'
import { sqlPool } from './pool'
import { setRLSContext } from './session-vars'
import type { Database } from './types'

/**
 * Typed DB client — generic over your Database schema
 */

type DatabaseClient<DB extends Database = Database> = {
    from: <T extends keyof DB['public']['Tables']>(
        table: T,
    ) => TypedQueryBuilder<DB['public']['Tables'][T]>

    raw: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>
    // transaction: <T>(cb: (tx: DatabaseClient<DB>) => Promise<T>) => Promise<T>
}

export function createDB<DB extends Database = Database>(): DatabaseClient<DB> {
    type Tables = DB['public']['Tables']

    return {
        from: <T extends keyof Tables>(table: T) =>
            new TypedQueryBuilder<Tables[T]>(table as string),

        raw: (strings: TemplateStringsArray, ...values: any[]) =>
            sqlPool(strings, ...values),

        // transaction: sqlPool.begin((tx) => {

        // }),
    }
}

class TypedQueryBuilder<Table extends Database['public']['Tables'][string]> {
    private table: string
    private selects: (keyof Table['Row'])[] | ['*'] = ['*']
    private wheres: Array<{ col: keyof Table['Row']; op: string; val: any }> = []
    private limitNum: number | null = null
    private returningFields: (keyof Table['Row'])[] | null = null

    constructor(table: string) {
        this.table = table
    }

    select<
        Fields extends keyof Table['Row'] | '*',
        Result = Fields extends '*'
        ? Table['Row']
        : Pick<Table['Row'], Fields extends keyof Table['Row'] ? Fields : never>,
    >(
        ...fields: Fields[]
    ): TypedQueryBuilder<Table> & { exec: () => Promise<Result[]> } {
        this.selects = fields.length ? (fields as string[]) : ['*']
        return this as any
    }

    eq<K extends keyof Table['Row']>(column: K, value: Table['Row'][K]): this {
        this.wheres.push({ col: column, op: '=', val: value })
        return this
    }

    // Add more: neq, gt, in, like, ilike, is, not, etc.
    // Example:
    in<K extends keyof Table['Row']>(column: K, values: Table['Row'][K][]): this {
        this.wheres.push({ col: column, op: 'IN', val: values })
        return this
    }

    limit(n: number): this {
        this.limitNum = n
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

    async exec(ctx?: { session?: any }): Promise<Table['Row'][]> {
        if (ctx) await setRLSContext(sqlPool, ctx)

        let query = sqlPool`SELECT ${sqlPool(this.selects)} FROM ${sqlPool(this.table)}`

        if (this.wheres.length > 0) {
            const conditions = this.wheres.map((w) => {
                if (w.op === 'IN') {
                    return sqlPool`${sqlPool(w.col)} IN (${sqlPool(w.val)})`
                }
                return sqlPool`${sqlPool(w.col)} ${sqlPool.raw(w.op)} ${w.val}`
            })

            query = sqlPool`${query} WHERE ${sqlPool.join(conditions, ' AND ')}`
        }

        if (this.limitNum !== null) {
            query = sqlPool`${query} LIMIT ${this.limitNum}`
        }

        // You can add ORDER BY, OFFSET, etc. here later

        const result = await query
        return result as Table['Row'][]
    }

    async insert(
        data: Table['Insert'],
        ctx?: { session?: any },
    ): Promise<Table['Row'] | null> {
        if (ctx) await setRLSContext(sqlPool, ctx)

        let q = sqlPool`INSERT INTO ${sqlPool(this.table)} ${sqlPool(data)}`

        if (this.returningFields) {
            q = sqlPool`${q} RETURNING ${sqlPool(this.returningFields)}`
        } else {
            q = sqlPool`${q} RETURNING *`
        }

        const result = await q
        return (result[0] as Table['Row']) ?? null
    }

    async update(
        data: Table['Update'],
        ctx?: { session?: any },
    ): Promise<Table['Row'][]> {
        if (ctx) await setRLSContext(sqlPool, ctx)

        let q = sqlPool`UPDATE ${sqlPool(this.table)} SET ${sqlPool(data)}`

        if (this.wheres.length > 0) {
            const conditions = this.wheres.map((w) => {
                if (w.op === 'IN') {
                    return sqlPool`${sqlPool(w.col)} IN (${sqlPool(w.val)})`
                }
                return sqlPool`${sqlPool(w.col)} ${sqlPool.raw(w.op)} ${w.val}`
            })
            q = sqlPool`${q} WHERE ${sqlPool.join(conditions, ' AND ')}`
        }

        if (this.returningFields) {
            q = sqlPool`${q} RETURNING ${sqlPool(this.returningFields)}`
        } else {
            q = sqlPool`${q} RETURNING *`
        }

        const result = await q
        return result as Table['Row'][]
    }

    async delete(ctx?: { session?: any }): Promise<Table['Row'][]> {
        if (ctx) await setRLSContext(sqlPool, ctx)

        let q = sqlPool`DELETE FROM ${sqlPool(this.table)}`

        if (this.wheres.length > 0) {
            const conditions = this.wheres.map((w) => {
                if (w.op === 'IN') {
                    return sqlPool`${sqlPool(w.col)} IN (${sqlPool(w.val)})`
                }
                return sqlPool`${sqlPool(w.col)} ${sqlPool(w.op)} ${w.val}`
            })
            q = sqlPool`${q} WHERE ${sqlPool.join(conditions, ' AND ')}`
        }

        if (this.returningFields) {
            q = sqlPool`${q} RETURNING ${sqlPool(this.returningFields)}`
        } else {
            q = sqlPool`${q} RETURNING *`
        }

        const result = await q
        return result as Table['Row'][]
    }
}
