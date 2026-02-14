import type { SQL } from 'bun'
import type { DatabaseClient } from './client.ts'
import { createDB } from './client.ts'
import type { Logger } from '../logger/index.ts'

export interface SeedContext {
	/** Database client with query builder */
	db: DatabaseClient
	/** Logger instance */
	logger: Logger
	/** Raw SQL client */
	sql: SQL
}

export interface SeedConfig {
	/** Seed name (for tracking) */
	name: string
	/** Optional description */
	description?: string
}

export interface SeedHandler {
	(ctx: SeedContext): Promise<void>
}

export interface SeedDefinition {
	config: SeedConfig
	handler: SeedHandler
}

/**
 * Define a database seed with context (db, logger, sql).
 * This is the recommended way to create seeds for type safety and consistency.
 *
 * @example
 * ```typescript
 * export const usersSeed = seed({
 *   name: 'users',
 *   description: 'Create initial admin users',
 * }, async ({ ctx }) => {
 *   await ctx.db.from('users').insert({
 *     email: 'admin@example.com',
 *     name: 'Admin User',
 *   }).exec()
 * })
 * ```
 */
export function seed(
	config: SeedConfig,
	handler: SeedHandler,
): SeedDefinition {
	return {
		config,
		handler,
	}
}

/**
 * Execute a seed with context.
 * Used internally by the Seeder to run seed definitions.
 */
export async function executeSeed(
	definition: SeedDefinition,
	sql: SQL,
	logger: Logger,
): Promise<void> {
	const db = createDB(sql)
	const ctx: SeedContext = {
		db,
		logger,
		sql,
	}

	await definition.handler(ctx)
}
