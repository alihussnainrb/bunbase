import { SQL } from "bun";

/**
 * Creates and exports a shared Bun.sql connection pool.
 * Uses DATABASE_URL from environment or falls back to a local default.
 */
export function createSQLPool(): SQL {
    const url =
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/bunbase';

    return new SQL(url, {
        // Recommended production-like settings
        max: 20,                     // max connections in pool
        idleTimeout: 30000,          // close idle connections after 30s
        connectionTimeout: 10000,    // fail after 10s if no connection
        maxLifetime: 3600000,        // recycle connections after 1 hour
        // ssl: process.env.NODE_ENV === 'production' ? 'require' : undefined,
    });
}

// Singleton pool — most apps only need one
export const sqlPool: SQL = createSQLPool();