import type { Static, TSchema } from "typebox"

export interface ParsedUrl<P extends TSchema = TSchema, Q extends TSchema = TSchema> {
  params: Static<P>
  query: Static<Q>
}

/**
 * Parse URL path parameters using a path pattern and TypeBox schema
 */
export function parsePathParams<P extends TSchema>(
  path: string,
  pattern: string,
  paramsSchema?: P
): Static<P> | Record<string, string> {
  const params: Record<string, string> = {}

  // Simple path matching - convert :param to regex groups
  const patternRegex = new RegExp(
    '^' + pattern.replace(/:([^\/]+)/g, '(?<$1>[^/]+)') + '$'
  )

  const match = path.match(patternRegex)
  if (match?.groups) {
    Object.assign(params, match.groups)
  }

  if (paramsSchema) {
    // Validate params against schema if provided
    // For now, just return as-is since TypeBox validation would need runtime
    return params as Static<P>
  }

  return params
}

/**
 * Parse URL query parameters using TypeBox schema
 */
export function parseQueryParams<Q extends TSchema>(
  url: URL,
  querySchema?: Q
): Static<Q> | Record<string, string> {
  const params: Record<string, string> = {}

  for (const [key, value] of url.searchParams) {
    params[key] = value
  }

  if (querySchema) {
    // Convert string values to appropriate types based on schema
    // For now, simple conversion - could be enhanced
    const converted: Record<string, any> = {}
    for (const [key, value] of Object.entries(params)) {
      if (value === '') continue
      // Try to parse as number
      const numValue = Number(value)
      if (!isNaN(numValue) && value !== '') {
        converted[key] = numValue
      } else if (value === 'true') {
        converted[key] = true
      } else if (value === 'false') {
        converted[key] = false
      } else {
        converted[key] = value
      }
    }
    return converted as Static<Q>
  }

  return params
}

/**
 * Match a view path pattern against a URL path
 */
export function matchViewPath(path: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/:([^\/]+)/g, '[^/]+') + '$'
  )
  return regex.test(path)
}
