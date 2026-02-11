import { describe, expect, it } from 'bun:test'
import type { ActionContext } from '../src/core/types.ts'
import { guards } from '../src/core/guards/index.ts'
import { GuardError } from '../src/core/guards/types.ts'

// Helper to create mock context
function createMockContext(
	overrides: Partial<ActionContext> = {},
): ActionContext {
	return {
		db: {} as any,
		storage: {} as any,
		kv: {} as any,
		logger: {
			info: () => {},
			error: () => {},
			debug: () => {},
			child: () => ({ info: () => {}, error: () => {}, debug: () => {} }),
		} as any,
		traceId: 'test-trace',
		event: { emit: () => {} },
		auth: {},
		...overrides,
	}
}

describe('guards.authenticated()', () => {
	it('should pass when userId is present', async () => {
		const guard = guards.authenticated()
		const ctx = createMockContext({ auth: { userId: 'user-123' } })

		// Should not throw
		await guard(ctx)
	})

	it('should throw GuardError with 401 when userId is missing', async () => {
		const guard = guards.authenticated()
		const ctx = createMockContext({ auth: {} })

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error).toBeDefined()
		expect(error?.message).toBe('Unauthorized')
		expect(error?.statusCode).toBe(401)
	})
})

describe('guards.hasRole()', () => {
	it('should pass when user has required role', async () => {
		const guard = guards.hasRole('admin')
		const ctx = createMockContext({
			auth: { userId: 'user-123', role: 'admin' },
		})

		await guard(ctx)
	})

	it('should throw 401 when user is not authenticated', async () => {
		const guard = guards.hasRole('admin')
		const ctx = createMockContext({ auth: { role: 'admin' } }) // Missing userId

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(401)
	})

	it('should throw 403 when user has different role', async () => {
		const guard = guards.hasRole('admin')
		const ctx = createMockContext({
			auth: { userId: 'user-123', role: 'member' },
		})

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(403)
		expect(error?.message).toBe('Forbidden')
	})
})

describe('guards.hasPermission()', () => {
	it('should pass when user has required permission', async () => {
		const guard = guards.hasPermission('users:create')
		const ctx = createMockContext({
			auth: {
				userId: 'user-123',
				permissions: ['users:create', 'users:read'],
			},
		})

		await guard(ctx)
	})

	it('should throw 401 when user is not authenticated', async () => {
		const guard = guards.hasPermission('users:create')
		const ctx = createMockContext({
			auth: { permissions: ['users:create'] },
		})

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(401)
	})

	it('should throw 403 when user lacks required permission', async () => {
		const guard = guards.hasPermission('users:delete')
		const ctx = createMockContext({
			auth: {
				userId: 'user-123',
				permissions: ['users:read'],
			},
		})

		let error: GuardError | undefined
		try {
			await guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(403)
	})
})

describe('guards.rateLimit()', () => {
	it('should pass within rate limit', () => {
		const guard = guards.rateLimit({ limit: 5, windowMs: 60000 })
		const ctx = createMockContext({
			auth: { userId: 'user-123' },
		})

		// First 5 calls should pass
		for (let i = 0; i < 5; i++) {
			guard(ctx)
		}
	})

	it('should throw 429 when rate limit exceeded', () => {
		const guard = guards.rateLimit({ limit: 2, windowMs: 60000 })
		const ctx = createMockContext({
			auth: { userId: 'user-123' },
		})

		// First 2 calls pass
		guard(ctx)
		guard(ctx)

		// Third call should throw
		let error: GuardError | undefined
		try {
			guard(ctx)
		} catch (e) {
			error = e as GuardError
		}

		expect(error?.statusCode).toBe(429)
		expect(error?.message).toBe('Too Many Requests')
	})

	it('should use custom key function when provided', () => {
		const keyFn = (ctx: ActionContext) => ctx.auth.orgId || 'anonymous'
		const guard = guards.rateLimit({
			limit: 2,
			windowMs: 60000,
			key: keyFn,
		})

		// Different orgs should have separate rate limits
		const ctx1 = createMockContext({
			auth: { userId: 'user-1', orgId: 'org-1' },
		})
		const ctx2 = createMockContext({
			auth: { userId: 'user-2', orgId: 'org-2' },
		})

		// Both can hit their own limits independently
		guard(ctx1)
		guard(ctx1)
		guard(ctx2)
		guard(ctx2)

		// Neither should throw yet
		expect(() => guard(ctx1)).toThrow(GuardError)
		expect(() => guard(ctx2)).toThrow(GuardError)
	})

	it('should use userId as default key', () => {
		const guard = guards.rateLimit({ limit: 1, windowMs: 60000 })

		const ctx1 = createMockContext({
			auth: { userId: 'user-1' },
		})
		const ctx2 = createMockContext({
			auth: { userId: 'user-2' },
		})

		guard(ctx1)
		guard(ctx2) // Different user, should not count against user-1

		// user-1's second call should throw
		expect(() => guard(ctx1)).toThrow(GuardError)
	})
})

describe('GuardError', () => {
	it('should have correct name and status code', () => {
		const error = new GuardError('Test error', 403)

		expect(error.name).toBe('GuardError')
		expect(error.message).toBe('Test error')
		expect(error.statusCode).toBe(403)
	})

	it('should default to 403 status code', () => {
		const error = new GuardError('Test error')

		expect(error.statusCode).toBe(403)
	})
})
