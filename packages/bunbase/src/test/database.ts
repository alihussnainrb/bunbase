import type { DatabaseClient } from '../db/client.ts'

/**
 * Run function in a transaction that always rolls back.
 * Useful for test isolation - changes are discarded after the test.
 *
 * @example
 * ```typescript
 * test('user creation', async () => {
 *   await withTestTransaction(db, async (tx) => {
 *     await tx.from('users').insert({ email: 'test@example.com' }).exec()
 *
 *     const users = await tx.from('users').eq('email', 'test@example.com').exec()
 *     expect(users.length).toBe(1)
 *   })
 *
 *   // Transaction rolled back - database unchanged
 *   const users = await db.from('users').eq('email', 'test@example.com').exec()
 *   expect(users.length).toBe(0)
 * })
 * ```
 */
export async function withTestTransaction<T>(
	db: DatabaseClient,
	fn: (tx: DatabaseClient) => Promise<T>,
): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			await fn(tx)
			// Force rollback by throwing
			throw new Error('TEST_ROLLBACK')
		})
	} catch (err) {
		// Expected rollback error - swallow it
		if (err instanceof Error && err.message === 'TEST_ROLLBACK') {
			return
		}
		// Re-throw unexpected errors
		throw err
	}
}
