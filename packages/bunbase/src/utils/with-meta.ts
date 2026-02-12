import type { ActionOutput, TransportMetadata } from '../core/types.ts'

/**
 * Helper function to attach transport metadata to action outputs.
 * Makes it easier to return data with HTTP status codes, headers, cookies,
 * or other transport-specific metadata.
 *
 * @example
 * // HTTP: Custom status and headers
 * return withMeta(
 *   { id: user.id, email: user.email },
 *   { http: { status: 201, headers: { Location: `/users/${user.id}` } } }
 * )
 *
 * @example
 * // MCP: Structured format
 * return withMeta(
 *   { analysis: result },
 *   { mcp: { format: 'structured', includeSchema: true } }
 * )
 *
 * @example
 * // Event: Priority emission
 * return withMeta(
 *   { processed: true },
 *   { event: { priority: 10, broadcast: true } }
 * )
 *
 * @example
 * // Cron: Dynamic rescheduling
 * return withMeta(
 *   { backupCompleted: true },
 *   { cron: { reschedule: '0 3 * * *' } }
 * )
 *
 * @example
 * // Multiple trigger types
 * return withMeta(
 *   { data: result },
 *   {
 *     http: { status: 201 },
 *     mcp: { format: 'json' },
 *     event: { broadcast: true }
 *   }
 * )
 */
export function withMeta<T>(
	data: T,
	metadata: TransportMetadata,
): ActionOutput<T> {
	return { ...data, _meta: metadata } as ActionOutput<T>
}
