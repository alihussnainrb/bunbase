import type { TObject, TSchema } from 'typebox'
import { getHttpMetadata } from '../utils/typebox.ts'

/**
 * Maps an HTTP request to action input by extracting values from
 * headers, query params, path params, cookies, and body based on schema metadata.
 */
export async function mapRequestToInput(
	req: Request,
	url: URL,
	schema: TObject,
	pathParams: Record<string, string>,
): Promise<Record<string, unknown>> {
	const input: Record<string, unknown> = {}
	const method = req.method.toUpperCase()

	// Parse body for POST/PUT/PATCH
	let body: Record<string, unknown> = {}
	if (['POST', 'PUT', 'PATCH'].includes(method)) {
		const contentType = req.headers.get('content-type') || ''
		if (contentType.includes('application/json')) {
			try {
				body = await req.json()
			} catch {
				body = {}
			}
		}
	}

	// Iterate over schema properties and extract based on HTTP metadata
	if (schema.properties && typeof schema.properties === 'object') {
		for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
			const meta = getHttpMetadata(fieldSchema as TSchema, fieldName)

			if (!meta) {
				// No HTTP metadata - treat as body field
				if (body[fieldName] !== undefined) {
					input[fieldName] = body[fieldName]
				}
				continue
			}

			// Extract based on location
			switch (meta.location) {
				case 'header': {
					const value = req.headers.get(meta.paramName!)
					if (value !== null) {
						input[fieldName] = value
					}
					break
				}

				case 'query': {
					const value = url.searchParams.get(meta.paramName!)
					if (value !== null) {
						input[fieldName] = parseQueryValue(value, fieldSchema as TSchema)
					}
					break
				}

				case 'path': {
					const value = pathParams[meta.paramName!]
					if (value !== undefined) {
						input[fieldName] = value
					}
					break
				}

				case 'cookie': {
					const cookieHeader = req.headers.get('cookie')
					if (cookieHeader) {
						const cookies = parseCookies(cookieHeader)
						const value = cookies[meta.paramName!]
						if (value !== undefined) {
							input[fieldName] = value
						}
					}
					break
				}
			}
		}
	}

	// Fallback: for GET/DELETE without HTTP metadata, use all query params
	if (['GET', 'DELETE'].includes(method) && Object.keys(input).length === 0) {
		for (const [key, value] of url.searchParams) {
			input[key] = value
		}
	}

	return input
}

/**
 * Parse query parameter value based on schema type
 */
function parseQueryValue(value: string, schema: TSchema): unknown {
	const schemaType = (schema as any).type

	if (schemaType === 'number' || schemaType === 'integer') {
		const num = Number(value)
		return Number.isNaN(num) ? value : num
	}

	if (schemaType === 'boolean') {
		return value === 'true' || value === '1'
	}

	if (schemaType === 'array') {
		return value.split(',').map((v) => v.trim())
	}

	return value
}

/**
 * Parse cookie header into key-value pairs
 */
function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {}
	for (const cookie of cookieHeader.split(';')) {
		const [key, ...valueParts] = cookie.split('=')
		const trimmedKey = key?.trim()
		if (trimmedKey) {
			cookies[trimmedKey] = valueParts.join('=').trim()
		}
	}
	return cookies
}
