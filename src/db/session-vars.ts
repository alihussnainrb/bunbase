// src/db/session-vars.ts
import type { SQL } from 'bun';

/**
 * Sets PostgreSQL session variables that RLS policies can read.
 * Typical usage: call this before every query in a context that has auth info.
 *
 * Common RLS policy pattern:
 *   USING (user_id = current_setting('app.current_user_id')::uuid)
 *   USING (org_id  = current_setting('app.current_org_id')::uuid)
 */
export async function setRLSContext(
    sql: SQL,
    ctx?: {
        session?: {
            userId?: string;
            orgId?: string;
            // You can add more: roles?: string[], ip?: string, etc.
        };
    },
): Promise<void> {
    if (!ctx?.session) return;

    const vars: Record<string, string | undefined> = {
        'app.current_user_id': ctx.session.userId,
        'app.current_org_id': ctx.session.orgId,
        // Add more session variables if your RLS policies need them
        // 'app.current_roles': ctx.session.roles?.join(','),
    };

    // Only set variables that have values
    for (const [key, value] of Object.entries(vars)) {
        if (value !== undefined && value !== null) {
            await sql`SET LOCAL ${sql(key)} = ${value}`;
        }
    }
}