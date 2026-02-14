import { describe, expect, test, afterEach } from 'bun:test'
import { action, t, triggers } from '../../packages/bunbase/src/index.ts'
import { executeAction } from '../../packages/bunbase/src/runtime/executor.ts'
import {
	createTestEnv,
	cleanupTestEnv,
	cleanupTestData,
	startTestServer,
} from './setup.ts'

describe('Integration: Database Transactions', () => {
	const env = createTestEnv()

	afterEach(async () => {
		await cleanupTestData(env)
		env.registry.clear()
	})

	afterEach(async () => {
		await cleanupTestEnv(env)
	})

	test('action can query database', async () => {
		const countUsers = action(
			{
				name: 'countUsers',
				input: t.Object({}),
				output: t.Object({ count: t.Number() }),
			},
			async (_, ctx) => {
				const result = await ctx.db.from('users').count()
				return { count: result }
			},
		)

		env.registry.registerAction(countUsers)

		const result = await executeAction(
			env.registry.get('countUsers')!,
			{},
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
			},
		)

		expect(result.success).toBe(true)
		expect(typeof (result.data as any)?.count).toBe('number')
	})

	test('action can insert and retrieve data', async () => {
		const createTestUser = action(
			{
				name: 'createTestUser',
				input: t.Object({ email: t.String(), password: t.String() }),
				output: t.Object({ id: t.String(), email: t.String() }),
			},
			async ({ email, password }, ctx) => {
				const user = await ctx.db.from('users').insert({
					email,
					password_hash: password, // In real app, use bcrypt
					name: 'Test User',
				})

				return {
					id: (user as any).id,
					email: (user as any).email,
				}
			},
		)

		env.registry.registerAction(createTestUser)

		const result = await executeAction(
			env.registry.get('createTestUser')!,
			{ email: 'test@example.com', password: 'hashedpassword' },
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
			},
		)

		expect(result.success).toBe(true)
		expect((result.data as any)?.email).toBe('test@example.com')
		expect((result.data as any)?.id).toBeDefined()
	})

	test('action can update existing data', async () => {
		// First create a user
		const user = await env.db.from('users').insert({
			email: 'update-test@example.com',
			password_hash: 'hashed',
			name: 'Original Name',
		})

		const userId = (user as any).id

		// Create action to update the user
		const updateUser = action(
			{
				name: 'updateUser',
				input: t.Object({ id: t.String(), name: t.String() }),
				output: t.Object({ id: t.String(), name: t.String() }),
			},
			async ({ id, name }, ctx) => {
				const updated = await ctx.db
					.from('users')
					.eq('id', id)
					.update({ name })
					.returning('id', 'name')
					.single()

				return {
					id: (updated as any).id,
					name: (updated as any).name,
				}
			},
		)

		env.registry.registerAction(updateUser)

		const result = await executeAction(
			env.registry.get('updateUser')!,
			{ id: userId, name: 'Updated Name' },
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
			},
		)

		expect(result.success).toBe(true)
		expect((result.data as any)?.name).toBe('Updated Name')

		// Verify the update persisted
		const fetched = await env.db.from('users').eq('id', userId).single()
		expect((fetched as any)?.name).toBe('Updated Name')
	})

	test('action can delete data', async () => {
		// First create a user
		const user = await env.db.from('users').insert({
			email: 'delete-test@example.com',
			password_hash: 'hashed',
			name: 'To Be Deleted',
		})

		const userId = (user as any).id

		// Create action to delete the user
		const deleteUser = action(
			{
				name: 'deleteUser',
				input: t.Object({ id: t.String() }),
				output: t.Object({ deleted: t.Boolean() }),
			},
			async ({ id }, ctx) => {
				await ctx.db.from('users').eq('id', id).delete()
				return { deleted: true }
			},
		)

		env.registry.registerAction(deleteUser)

		const result = await executeAction(
			env.registry.get('deleteUser')!,
			{ id: userId },
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
			},
		)

		expect(result.success).toBe(true)
		expect((result.data as any)?.deleted).toBe(true)

		// Verify the user is deleted
		const fetched = await env.db.from('users').eq('id', userId).maybeSingle()
		expect(fetched).toBeNull()
	})

	test('database errors are handled gracefully', async () => {
		const duplicateEmail = action(
			{
				name: 'duplicateEmail',
				input: t.Object({ email: t.String() }),
				output: t.Object({ id: t.String() }),
			},
			async ({ email }, ctx) => {
				// Create first user
				await ctx.db.from('users').insert({
					email,
					password_hash: 'hashed',
					name: 'First User',
				})

				// Try to create duplicate (should fail due to unique constraint)
				const user = await ctx.db.from('users').insert({
					email,
					password_hash: 'hashed',
					name: 'Second User',
				})

				return { id: (user as any).id }
			},
		)

		env.registry.registerAction(duplicateEmail)

		const result = await executeAction(
			env.registry.get('duplicateEmail')!,
			{ email: 'duplicate@example.com' },
			{
				triggerType: 'test',
				logger: env.logger,
				writeBuffer: env.writeBuffer,
				db: env.db,
				queue: env.queue,
			},
		)

		expect(result.success).toBe(false)
		expect(result.error).toBeDefined()
	})
})
