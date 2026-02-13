import { CookieMap } from 'bun'
import type { TObject } from 'typebox'
import type { CookieOptions } from './typebox.ts'
import { getHttpMetadata } from './typebox.ts'

/**
 * Maps request data from various sources (body, query, headers, path, cookies)
 * to a unified input object based on schema metadata
 */
export function mapRequestToInput(
	req: Request,
	schema: TObject,
	pathParams?: Record<string, string>,
): Record<string, any> {
	const url = new URL(req.url)
	const input: Record<string, any> = {}

	// Parse cookies from Cookie header using Bun's native CookieMap
	const cookieHeader = req.headers.get('cookie') || ''
	const cookieMap = new CookieMap(cookieHeader)
	const cookies: Record<string, string> = {}
	for (const [key, value] of cookieMap) {
		cookies[key] = value
	}

	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)

		if (!meta) {
			// Body field (default) - handled by executor
			continue
		}

		const sourceName = meta.paramName!

		switch (meta.location) {
			case 'query':
				input[fieldName] = url.searchParams.get(sourceName) || undefined
				break

			case 'header':
				input[fieldName] = req.headers.get(sourceName) || undefined
				break

			case 'path':
				input[fieldName] = pathParams?.[sourceName]
				break

			case 'cookie':
				input[fieldName] = cookies[sourceName] || undefined
				break
		}
	}

	return input
}

/**
 * Extracts fields that should come from request body
 */
export function getBodyFields(schema: TObject): string[] {
	const bodyFields: string[] = []

	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)

		if (!meta) {
			// No HTTP mapping = body field
			bodyFields.push(fieldName)
		}
	}

	return bodyFields
}

/**
 * Maps output data to response body, headers, and cookies based on schema metadata
 */
export function mapOutputToResponse(
	output: Record<string, any>,
	schema: TObject,
): {
	body: Record<string, any>
	headers: Record<string, string>
	cookies: Array<{ name: string; value: string; options: CookieOptions }>
} {
	const body: Record<string, any> = {}
	const headers: Record<string, string> = {}
	const cookies: Array<{
		name: string
		value: string
		options: CookieOptions
	}> = []

	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)
		const value = output[fieldName]

		if (value === undefined) continue

		if (!meta) {
			// Body field (default)
			body[fieldName] = value
			continue
		}

		const destName = meta.paramName!

		switch (meta.location) {
			case 'header':
				headers[destName] = String(value)
				break

			case 'cookie':
				cookies.push({
					name: destName,
					value: String(value),
					options: meta.cookieOptions || {},
				})
				break

			case 'query':
			case 'path':
				// Query and path are input-only, ignore in output
				break
		}
	}

	return { body, headers, cookies }
}

/**
 * Serializes a cookie with options to Set-Cookie header value
 */
export function serializeCookie(
	name: string,
	value: string,
	options: CookieOptions = {},
): string {
	let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`

	if (options.maxAge !== undefined) {
		cookie += `; Max-Age=${options.maxAge}`
	}

	if (options.path) {
		cookie += `; Path=${options.path}`
	}

	if (options.domain) {
		cookie += `; Domain=${options.domain}`
	}

	if (options.httpOnly) {
		cookie += '; HttpOnly'
	}

	if (options.secure) {
		cookie += '; Secure'
	}

	if (options.sameSite) {
		cookie += `; SameSite=${options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)}`
	}

	return cookie
}

/**
 * Checks if a schema has any non-body input mappings
 */
export function hasCustomInputMapping(schema: TObject): boolean {
	for (const fieldSchema of Object.values(schema.properties)) {
		const meta = fieldSchema as any
		if (meta.from && meta.from !== 'body') {
			return true
		}
	}
	return false
}

/**
 * Checks if a schema has any non-body output mappings
 */
export function hasCustomOutputMapping(schema: TObject): boolean {
	for (const fieldSchema of Object.values(schema.properties)) {
		const meta = fieldSchema as any
		if (meta.to && meta.to !== 'body') {
			return true
		}
	}
	return false
}
