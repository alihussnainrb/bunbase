import { hashPassword, verifyPassword } from '../auth/password.ts'
import type { DatabaseClient } from '../db/client.ts'

/**
 * Manages user accounts (CRUD, password operations).
 * All data is database-backed — requires a `users` table.
 */
export class UsersManager {
	constructor(private readonly db: DatabaseClient) {}

	/**
	 * Get a user by ID.
	 */
	async getById(id: string): Promise<Record<string, unknown> | null> {
		return this.db.from('users').eq('id', id).maybeSingle()
	}

	/**
	 * Get a user by email.
	 */
	async getByEmail(email: string): Promise<Record<string, unknown> | null> {
		return this.db.from('users').eq('email', email).maybeSingle()
	}

	/**
	 * Get a user by username.
	 */
	async getByUsername(
		username: string,
	): Promise<Record<string, unknown> | null> {
		return this.db.from('users').eq('username', username).maybeSingle()
	}

	/**
	 * Get a user by phone.
	 */
	async getByPhone(phone: string): Promise<Record<string, unknown> | null> {
		return this.db.from('users').eq('phone', phone).maybeSingle()
	}

	/**
	 * Create a new user. Password is automatically hashed.
	 *
	 * @example
	 * const user = await ctx.iam.users.create({
	 *   email: 'user@example.com',
	 *   password: 'secret',
	 *   first_name: 'John',
	 *   last_name: 'Doe',
	 * })
	 */
	async create(data: {
		email?: string
		username?: string
		phone?: string
		password: string
		first_name?: string
		last_name?: string
		[key: string]: unknown
	}): Promise<Record<string, unknown>> {
		const { password, ...rest } = data
		const password_hash = await hashPassword(password)

		const user = await this.db.from('users').insert({
			...rest,
			password_hash,
		})

		return user!
	}

	/**
	 * Update user fields by ID.
	 * Does NOT update password — use `updatePassword()` for that.
	 *
	 * @example
	 * await ctx.iam.users.update('user-123', { first_name: 'Jane' })
	 */
	async update(id: string, data: Record<string, unknown>): Promise<void> {
		await this.db.from('users').eq('id', id).update(data)
	}

	/**
	 * Delete a user by ID.
	 */
	async delete(id: string): Promise<void> {
		await this.db.from('users').eq('id', id).delete()
	}

	/**
	 * Update a user's password. Hashes the new password automatically.
	 *
	 * @example
	 * await ctx.iam.users.updatePassword('user-123', 'newSecret')
	 */
	async updatePassword(id: string, newPassword: string): Promise<void> {
		const password_hash = await hashPassword(newPassword)
		await this.db.from('users').eq('id', id).update({ password_hash })
	}

	/**
	 * Verify a user's current password.
	 * Returns true if the password matches, false otherwise.
	 */
	async verifyPassword(id: string, password: string): Promise<boolean> {
		const user = await this.db.from('users').eq('id', id).maybeSingle()
		if (!user) return false
		return verifyPassword(password, (user as any).password_hash)
	}

	/**
	 * List users with optional filters.
	 */
	async list(opts?: {
		limit?: number
		offset?: number
	}): Promise<Record<string, unknown>[]> {
		let query = this.db.from('users')
		if (opts?.limit) {
			query = query.limit(opts.limit) as any
		}
		if (opts?.offset) {
			query = query.offset(opts.offset) as any
		}
		return query.exec() as Promise<Record<string, unknown>[]>
	}
}
