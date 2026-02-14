import { Value } from '@sinclair/typebox/value'
import type { Static, TSchema } from '@sinclair/typebox'

export interface ParsedUrl<
	P extends TSchema = TSchema,
	Q extends TSchema = TSchema,
> {
	params: Static<P>
	query: Static<Q>
}

/**
 * Parse URL path parameters using a path pattern and TypeBox schema
 */
export function parsePathParams<P extends TSchema>(
	path: string,
	pattern: string,
	paramsSchema?: P,
): Static<P> | Record<string, string> {
	const params: Record<string, string> = {}

	// Simple path matching - convert :param to regex groups
	const patternRegex = new RegExp(
		`^${pattern.replace(/:([^/]+)/g, '(?<$1>[^/]+)')}$`,
	)

	const match = path.match(patternRegex)
	if (match?.groups) {
		Object.assign(params, match.groups)
	}

	if (paramsSchema) {
		// Convert and validate params against schema
		const schema = paramsSchema as TSchema
		const converted = Value.Convert(schema, params)
		if (!Value.Check(schema, converted)) {
			const errors = [...Value.Errors(schema, converted)]
			throw new Error(
				`Invalid path parameters: ${errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
			)
		}
		return converted as Static<P>
	}

	return params
}

/**
 * Parse URL query parameters using TypeBox schema
 */
export function parseQueryParams<Q extends TSchema>(
	url: URL,
	querySchema?: Q,
): Static<Q> | Record<string, string> {
	const params: Record<string, string> = {}

	for (const [key, value] of url.searchParams) {
		params[key] = value
	}

	if (querySchema) {
		// Convert and validate query params against schema
		const schema = querySchema as TSchema
		const converted = Value.Convert(schema, params)
		if (!Value.Check(schema, converted)) {
			const errors = [...Value.Errors(schema, converted)]
			throw new Error(
				`Invalid query parameters: ${errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
			)
		}
		return converted as Static<Q>
	}

	return params
}

/**
 * Match a view path pattern against a URL path
 */
export function matchViewPath(path: string, pattern: string): boolean {
	const regex = new RegExp(`^${pattern.replace(/:([^/]+)/g, '[^/]+')}$`)
	return regex.test(path)
}
