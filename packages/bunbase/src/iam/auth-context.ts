import { hashPassword, verifyPassword } from '../auth/password.ts'
import type { SessionManager } from '../auth/session.ts'
import type { DatabaseClient } from '../db/client.ts'
import type { Logger } from '../logger/index.ts'
import { CACHE_TTL_MS, permissionCache } from './context.ts'
import { RoleManager } from './role-manager.ts'
import type { SessionAction } from './types.ts'

/**
 * AuthContext — the primary per-request interface for authentication and authorization.
 * Accessed via ctx.auth in action handlers.
 */
export interface AuthContext {
	userId?: string
	orgId?: string
	role?: string
	permissions?: string[]
	/** Internal call stack for loop detection */
	_callStack?: string[]

	/**
	 * Fetch full user data from database.
	 * Only available if database is configured.
	 */
	user?: () => Promise<{
		id: string
		email: string
		name: string | null
		created_at: Date
		email_verified_at: Date | null
		[key: string]: unknown
	} | null>

	/**
	 * Fetch full team/org data from database.
	 * Only available if database is configured and orgId is set.
	 */
	team?: () => Promise<{
		id: string
		name: string
		slug: string
		owner_id: string
		created_at: Date
		[key: string]: unknown
	} | null>

	/**
	 * Create a signed session token and mark it for cookie setting.
	 * The runtime will automatically set the session cookie on the HTTP response.
	 */
	createSession: (payload: {
		userId: string
		role?: string
		[key: string]: unknown
	}) => string

	/**
	 * Destroy the current session. Marks the session cookie for clearing.
	 */
	destroySession: () => void

	/**
	 * Login with email and password.
	 * Looks up user by `email` column, verifies `password_hash`, creates session.
	 *
	 * @example
	 * const user = await ctx.auth.loginWithEmail({ email: 'user@example.com', password: 'secret' })
	 */
	loginWithEmail: (data: {
		email: string
		password: string
	}) => Promise<{ id: string; email: string; [key: string]: unknown }>

	/**
	 * Login with username and password.
	 * Looks up user by `username` column, verifies `password_hash`, creates session.
	 *
	 * @example
	 * const user = await ctx.auth.loginWithUsername({ username: 'johndoe', password: 'secret' })
	 */
	loginWithUsername: (data: {
		username: string
		password: string
	}) => Promise<{ id: string; username: string; [key: string]: unknown }>

	/**
	 * Login with phone and password.
	 * Looks up user by `phone` column, verifies `password_hash`, creates session.
	 *
	 * @example
	 * const user = await ctx.auth.loginWithPhone({ phone: '+1234567890', password: 'secret' })
	 */
	loginWithPhone: (data: {
		phone: string
		password: string
	}) => Promise<{ id: string; phone: string; [key: string]: unknown }>

	/**
	 * Signup: create user with hashed password, create session, return user.
	 * Requires database with a `users` table.
	 *
	 * @example
	 * const user = await ctx.auth.signup({ email: 'user@example.com', password: 'secret', name: 'John' })
	 */
	signup: (data: {
		email?: string
		username?: string
		password: string
		name?: string
		[key: string]: unknown
	}) => Promise<{ id: string; [key: string]: unknown }>

	/**
	 * Logout: alias for destroySession().
	 */
	logout: () => void

	/**
	 * Check if the current user has a specific permission.
	 * Uses cached database lookups (5-min TTL).
	 *
	 * @example
	 * const { allowed, reason } = await ctx.auth.can('article:publish')
	 */
	can: (permission: string) => Promise<{ allowed: boolean; reason?: string }>

	/**
	 * Batch check multiple permissions at once.
	 *
	 * @example
	 * const results = await ctx.auth.canAll(['article:publish', 'article:delete'])
	 */
	canAll: (permissions: string[]) => Promise<Map<string, boolean>>

	/**
	 * Check if the current user has a specific role (synchronous).
	 */
	hasRole: (role: string) => boolean

	/** Internal: pending session actions for the runtime to apply */
	_sessionActions?: SessionAction[]

	/** Allow additional properties from session payload */
	[key: string]: unknown
}

export interface CreateAuthContextOptions {
	auth?: {
		userId?: string
		role?: string
		permissions?: string[]
		orgId?: string
		[key: string]: unknown
	}
	db?: DatabaseClient
	sessionManager?: SessionManager
	logger: Logger
}

/**
 * Creates the AuthContext that powers ctx.auth.
 * Provides session management, lazy user/team loading, and permission checking.
 */
export function createAuthContext(opts: CreateAuthContextOptions): AuthContext {
	const sessionActions: SessionAction[] = []
	const db = opts.db
	const sessionManager = opts.sessionManager
	const roleKey = opts.auth?.role

	/**
	 * Fetch permissions for the current role (with caching).
	 * Reuses the shared permissionCache from context.ts.
	 */
	const getRolePermissions = async (): Promise<string[]> => {
		if (!roleKey || !db) {
			return opts.auth?.permissions ?? []
		}

		// Check cache
		const cached = permissionCache.get(roleKey)
		if (cached && cached.expiresAt > Date.now()) {
			return cached.permissions
		}

		// Cache miss - query database
		try {
			const roleManager = new RoleManager(db)
			const permissions = await roleManager.getRolePermissions(roleKey)

			// Cache result
			permissionCache.set(roleKey, {
				permissions,
				expiresAt: Date.now() + CACHE_TTL_MS,
			})

			return permissions
		} catch (err) {
			opts.logger.error('Failed to fetch role permissions', {
				roleKey,
				error: err instanceof Error ? err.message : String(err),
			})
			return opts.auth?.permissions ?? []
		}
	}

	/**
	 * Check if a permission is present in a list (supports wildcards).
	 */
	const checkPermission = (
		permissions: string[],
		permission: string,
	): boolean => {
		if (permissions.includes('*')) return true
		if (permissions.includes(permission)) return true
		const namespace = permission.split(':')[0]
		if (permissions.includes(`${namespace}:*`)) return true
		return false
	}

	const ctx: AuthContext = {
		// Spread session state
		...(opts.auth ?? {}),

		// Internal tracking
		_sessionActions: sessionActions,

		// Lazy user loader
		user:
			db && opts.auth?.userId
				? async () => {
						const user = await db
							.from('users')
							.eq('id', opts.auth!.userId!)
							.maybeSingle()
						return user as any
					}
				: undefined,

		// Lazy team/org loader
		team:
			db && opts.auth?.orgId
				? async () => {
						const team = await db
							.from('organizations')
							.eq('id', opts.auth!.orgId!)
							.maybeSingle()
						return team as any
					}
				: undefined,

		// Session management
		createSession(payload) {
			if (!sessionManager) {
				throw new Error(
					'Session manager not configured. Add session secret to bunbase.config.ts',
				)
			}
			const token = sessionManager.createSession(payload)
			sessionActions.push({ type: 'create', token })
			// Update auth state for the current request
			ctx.userId = payload.userId
			ctx.role = payload.role
			return token
		},

		destroySession() {
			sessionActions.push({ type: 'destroy' })
		},

		async loginWithEmail(data) {
			if (!db) {
				throw new Error('Database not configured')
			}

			const user = await db.from('users').eq('email', data.email).maybeSingle()
			if (!user) {
				throw new Error('Invalid credentials')
			}

			const valid = await verifyPassword(
				data.password,
				(user as any).password_hash,
			)
			if (!valid) {
				throw new Error('Invalid credentials')
			}

			ctx.createSession({
				userId: (user as any).id,
				role: (user as any).role,
			})

			return user as any
		},

		async loginWithUsername(data) {
			if (!db) {
				throw new Error('Database not configured')
			}

			const user = await db
				.from('users')
				.eq('username', data.username)
				.maybeSingle()
			if (!user) {
				throw new Error('Invalid credentials')
			}

			const valid = await verifyPassword(
				data.password,
				(user as any).password_hash,
			)
			if (!valid) {
				throw new Error('Invalid credentials')
			}

			ctx.createSession({
				userId: (user as any).id,
				role: (user as any).role,
			})

			return user as any
		},

		async loginWithPhone(data) {
			if (!db) {
				throw new Error('Database not configured')
			}

			const user = await db.from('users').eq('phone', data.phone).maybeSingle()
			if (!user) {
				throw new Error('Invalid credentials')
			}

			const valid = await verifyPassword(
				data.password,
				(user as any).password_hash,
			)
			if (!valid) {
				throw new Error('Invalid credentials')
			}

			ctx.createSession({
				userId: (user as any).id,
				role: (user as any).role,
			})

			return user as any
		},

		async signup(data) {
			if (!db) {
				throw new Error('Database not configured')
			}

			const { password, ...rest } = data
			const passwordHash = await hashPassword(password)

			const user = await db.from('users').insert({
				...rest,
				password_hash: passwordHash,
			})

			ctx.createSession({ userId: (user as any).id })

			return user as any
		},

		logout() {
			ctx.destroySession()
		},

		// Permission checks
		async can(permission: string) {
			if (!ctx.userId) {
				return {
					allowed: false,
					reason: 'User not authenticated',
				}
			}

			const permissions = await getRolePermissions()
			if (checkPermission(permissions, permission)) {
				return { allowed: true }
			}

			return {
				allowed: false,
				reason: `Missing permission: ${permission}`,
			}
		},

		async canAll(permissions: string[]) {
			const rolePermissions = await getRolePermissions()
			const results = new Map<string, boolean>()

			for (const permission of permissions) {
				results.set(permission, checkPermission(rolePermissions, permission))
			}

			return results
		},

		hasRole(role: string) {
			return ctx.role === role
		},
	}

	return ctx
}
