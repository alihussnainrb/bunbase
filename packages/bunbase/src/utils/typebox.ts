import type { TSchema } from 'typebox'
import { Type } from 'typebox'

export type { TSchema }

/**
 * Cookie options for Set-Cookie header
 */
export interface CookieOptions {
	httpOnly?: boolean
	secure?: boolean
	sameSite?: 'strict' | 'lax' | 'none'
	maxAge?: number // seconds
	path?: string
	domain?: string
}

/**
 * HTTP mapping metadata stored in schemas
 */
interface HttpMetadata {
	location: 'header' | 'query' | 'path' | 'cookie'
	paramName?: string
	cookieOptions?: CookieOptions
}

const HTTP_META_KEY = Symbol.for('bunbase.http')

/**
 * Re-export TypeBox Type as t
 */
export const t: typeof Type = Type

/**
 * HTTP request/response mapping utilities
 *
 * Maps schema fields to/from HTTP sources based on context (input vs output):
 * - **Input**: Read from request (headers, query, path, cookies)
 * - **Output**: Write to response (headers, cookies)
 *
 * @example
 * // Input - Read from HTTP request
 * input: t.Object({
 *   // Read from header (auto-match field name)
 *   userId: http.Header(t.String()),
 *
 *   // Read from header (explicit name)
 *   apiKey: http.Header(t.String(), 'X-API-Key'),
 *
 *   // Read from query parameter
 *   page: http.Query(t.Number()),
 *   status: http.Query(t.String(), 'filter_status'),
 *
 *   // Read from path parameter
 *   id: http.Path(t.String()),
 *
 *   // Read from cookie
 *   session: http.Cookie(t.String(), 'session_id'),
 *
 *   // Body fields (no wrapper)
 *   email: t.String(),
 *   password: t.String(),
 * })
 *
 * // Output - Write to HTTP response
 * output: t.Object({
 *   // Write to header
 *   userId: http.Header(t.String(), 'X-User-ID'),
 *   rateLimit: http.Header(t.Number()), // uses field name
 *
 *   // Write to cookie
 *   refreshToken: http.Cookie(t.String(), 'refresh_token', {
 *     httpOnly: true,
 *     secure: true,
 *     maxAge: 86400
 *   }),
 *
 *   // Body fields (no wrapper)
 *   user: t.Object({ id: t.String(), email: t.String() }),
 *   accessToken: t.String(),
 * })
 */
export const http = {
	/**
	 * Map field to/from HTTP header
	 * - **Input**: Read from request header
	 * - **Output**: Write to response header
	 *
	 * @param schema - TypeBox schema for validation
	 * @param headerName - HTTP header name (defaults to field name if not provided)
	 * @example
	 * // Input
	 * userId: http.Header(t.String({ format: 'uuid' }))
	 * apiKey: http.Header(t.String(), 'X-API-Key')
	 *
	 * // Output
	 * userId: http.Header(t.String(), 'X-User-ID')
	 * customHeader: http.Header(t.String())
	 */
	Header<T extends TSchema>(schema: T, headerName?: string): T {
		return Object.assign({}, schema, {
			[HTTP_META_KEY]: {
				location: 'header',
				paramName: headerName,
			} as HttpMetadata,
		})
	},

	/**
	 * Map field to/from URL query parameter
	 * - **Input**: Read from query string
	 * - **Output**: Not applicable (query params are input-only)
	 *
	 * @param schema - TypeBox schema for validation
	 * @param paramName - Query parameter name (defaults to field name if not provided)
	 * @example
	 * page: http.Query(t.Number({ minimum: 1 }))
	 * status: http.Query(t.Union([t.Literal('active'), t.Literal('inactive')]))
	 * userId: http.Query(t.String(), 'user_id')
	 */
	Query<T extends TSchema>(schema: T, paramName?: string): T {
		return Object.assign({}, schema, {
			[HTTP_META_KEY]: {
				location: 'query',
				paramName,
			} as HttpMetadata,
		})
	},

	/**
	 * Map field to/from URL path parameter
	 * - **Input**: Read from route path (e.g., /users/:id)
	 * - **Output**: Not applicable (path params are input-only)
	 *
	 * @param schema - TypeBox schema for validation
	 * @param paramName - Path parameter name (defaults to field name if not provided)
	 * @example
	 * id: http.Path(t.String({ format: 'uuid' }))
	 * taskId: http.Path(t.String(), 'task_id')
	 */
	Path<T extends TSchema>(schema: T, paramName?: string): T {
		return Object.assign({}, schema, {
			[HTTP_META_KEY]: {
				location: 'path',
				paramName,
			} as HttpMetadata,
		})
	},

	/**
	 * Map field to/from HTTP cookie
	 * - **Input**: Read from Cookie header
	 * - **Output**: Write to Set-Cookie header
	 *
	 * @param schema - TypeBox schema for validation
	 * @param cookieName - Cookie name (defaults to field name if not provided)
	 * @param options - Cookie options for output (httpOnly, secure, maxAge, etc.)
	 * @example
	 * // Input
	 * session: http.Cookie(t.String())
	 * rememberToken: http.Cookie(t.String(), 'remember_token')
	 *
	 * // Output
	 * refreshToken: http.Cookie(t.String(), 'refresh_token', {
	 *   httpOnly: true,
	 *   secure: true,
	 *   sameSite: 'strict',
	 *   maxAge: 7 * 24 * 60 * 60
	 * })
	 */
	Cookie<T extends TSchema>(
		schema: T,
		cookieName?: string,
		options?: CookieOptions,
	): T {
		return Object.assign({}, schema, {
			[HTTP_META_KEY]: {
				location: 'cookie',
				paramName: cookieName,
				cookieOptions: options,
			} as HttpMetadata,
		})
	},
}

/**
 * Extract HTTP mapping metadata from schema
 * @param schema - TypeBox schema
 * @param fieldName - The field name in the parent object (for auto-matching)
 * @returns HTTP metadata with resolved parameter name
 */
export function getHttpMetadata(
	schema: TSchema,
	fieldName?: string,
): HttpMetadata | undefined {
	const meta = (schema as any)[HTTP_META_KEY] as HttpMetadata | undefined
	if (!meta) return undefined

	// Auto-match: if paramName is undefined, use field name
	return {
		...meta,
		paramName: meta.paramName ?? fieldName,
	}
}

/**
 * Check if schema has HTTP mapping
 */
export function hasHttpMapping(schema: TSchema): boolean {
	return (schema as any)[HTTP_META_KEY] !== undefined
}

export default t
