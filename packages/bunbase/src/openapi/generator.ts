import type {
	OpenApiBuilder,
	OperationObject,
	PathItemObject,
	ResponseObject,
} from 'openapi3-ts/oas31'
import type { TObject, TSchema } from 'typebox'
import type { ActionRegistry } from '../core/registry.ts'
import { getHttpMetadata } from '../utils/typebox.ts'

export type { OpenApiBuilder }

/**
 * Extract path parameters from URL path
 */
function extractPathParameters(path: string): Array<{
	name: string
	in: 'path'
	required: true
	schema: { type: 'string' }
}> {
	const pathParams: Array<any> = []
	// Match :param or {param} style parameters
	const paramPattern = /[:{](\w+)[}]?/g
	let match: RegExpExecArray | null

	while ((match = paramPattern.exec(path)) !== null) {
		const paramName = match[1]
		pathParams.push({
			name: paramName,
			in: 'path' as const,
			required: true,
			schema: { type: 'string' },
		})
	}

	return pathParams
}

/**
 * Convert Express-style path to OpenAPI format
 * :userId -> {userId}
 */
function convertPathToOpenAPI(path: string): string {
	return path.replace(/:(\w+)/g, '{$1}')
}

/**
 * Extract parameters from input schema based on HTTP metadata
 */
function extractParameters(schema: TObject): Array<{
	name: string
	in: 'query' | 'header' | 'path' | 'cookie'
	required: boolean
	schema: any
}> {
	const parameters: Array<any> = []
	const required = schema.required || []

	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)
		if (!meta) continue // Body field, skip

		parameters.push({
			name: meta.paramName!,
			in: meta.location,
			required: required.includes(fieldName),
			schema: typeboxToOpenAPI(fieldSchema),
		})
	}

	return parameters
}

/**
 * Extract body schema (fields without HTTP metadata)
 */
function extractBodySchema(schema: TObject): TObject | null {
	const bodyProperties: Record<string, any> = {}
	const required: string[] = []

	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)
		if (meta) continue // Has HTTP mapping, skip

		bodyProperties[fieldName] = fieldSchema
		if (schema.required?.includes(fieldName)) {
			required.push(fieldName)
		}
	}

	if (Object.keys(bodyProperties).length === 0) {
		return null // No body fields
	}

	return {
		type: 'object',
		properties: bodyProperties,
		required: required.length > 0 ? required : undefined,
	} as TObject
}

/**
 * Extract response headers from output schema
 */
function extractResponseHeaders(schema: TObject): Record<string, any> {
	const headers: Record<string, any> = {}

	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)
		if (!meta || meta.location !== 'header') continue

		headers[meta.paramName!] = {
			description: `Response header ${meta.paramName}`,
			schema: typeboxToOpenAPI(fieldSchema),
		}
	}

	return headers
}

/**
 * Generate OpenAPI 3.1 spec from registered actions.
 * Extracts TypeBox schemas for inputs/outputs.
 */
export function generateOpenAPISpec(
	registry: ActionRegistry,
	opts: { title?: string; version?: string; description?: string } = {},
): ReturnType<OpenApiBuilder['getSpec']> {
	// Dynamic import to avoid issues if package not available
	const { OpenApiBuilder } = require('openapi3-ts/oas31')

	const builder = OpenApiBuilder.create({
		openapi: '3.1.0',
		info: {
			title: opts.title ?? 'Bunbase API',
			version: opts.version ?? '1.0.0',
			description: opts.description,
		},
		paths: {},
	})

	for (const action of registry.getAll()) {
		for (const trigger of action.triggers) {
			if (trigger.type === 'api') {
				const expressPath = trigger.path
				const openapiPath = convertPathToOpenAPI(expressPath)
				const method = trigger.method.toLowerCase() as
					| 'get'
					| 'post'
					| 'put'
					| 'patch'
					| 'delete'

				const config = action.definition.config

				// Check if schemas have properties (TObject)
				const inputHasProperties =
					'properties' in config.input &&
					typeof config.input.properties === 'object'
				const outputHasProperties =
					'properties' in config.output &&
					typeof config.output.properties === 'object'

				// Extract all parameters
				const schemaParameters = inputHasProperties
					? extractParameters(config.input as TObject)
					: []
				const pathParameters = extractPathParameters(expressPath)

				// Deduplicate parameters by name (schema params take precedence over path params)
				const paramMap = new Map<string, any>()
				for (const param of pathParameters) {
					paramMap.set(param.name, param)
				}
				for (const param of schemaParameters) {
					paramMap.set(param.name, param)
				}
				const allParameters = Array.from(paramMap.values())

				const operation: OperationObject = {
					operationId: config.name,
					summary: config.description,
					description: config.description,
					// Combine path parameters and schema parameters
					parameters: allParameters,
					// Extract body schema (only non-HTTP-mapped fields)
					requestBody: ['post', 'put', 'patch'].includes(method)
						? (() => {
								if (!inputHasProperties) {
									return {
										content: {
											'application/json': {
												schema: typeboxToOpenAPI(config.input) as any,
											},
										},
										required: true,
									}
								}
								const bodySchema = extractBodySchema(config.input as TObject)
								return bodySchema
									? {
											content: {
												'application/json': {
													schema: bodySchema as any,
												},
											},
											required: true,
										}
									: undefined
							})()
						: undefined,
					responses: {
						'200': {
							description: 'Success',
							content: {
								'application/json': {
									schema: (() => {
										if (!outputHasProperties) {
											return typeboxToOpenAPI(config.output) as any
										}
										const bodySchema = extractBodySchema(
											config.output as TObject,
										)
										return bodySchema ? (bodySchema as any) : { type: 'object' }
									})(),
								},
							},
							// Add response headers
							headers: outputHasProperties
								? extractResponseHeaders(config.output as TObject)
								: undefined,
						} as ResponseObject,
						'400': { description: 'Validation error' },
						'401': { description: 'Unauthorized' },
						'403': { description: 'Forbidden' },
						'500': { description: 'Internal server error' },
					},
				}

				builder.addPath(openapiPath, { [method]: operation } as PathItemObject)
			}
		}
	}

	return builder.getSpec()
}

/**
 * Convert TypeBox schema to OpenAPI schema format.
 * Simply returns the schema as-is since TypeBox and OpenAPI are compatible.
 */
function typeboxToOpenAPI(schema: TSchema): unknown {
	// Return a clean copy without circular references
	return JSON.parse(
		JSON.stringify(schema, (key, value) => {
			// Remove TypeBox internal symbols and methods
			if (key === 'static' || key === '[Kind]' || key === 'params') {
				return undefined
			}
			return value
		}),
	)
}

/**
 * Generate HTML page with Scalar API documentation.
 */
export function generateScalarDocs(
	spec: ReturnType<OpenApiBuilder['getSpec']>,
): string {
	const specJson = JSON.stringify(spec, null, 2)

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${spec.info?.title ?? 'API'} - API Docs</title>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest"></script>
    <style>
        body { margin: 0; padding: 0; }
        #api-reference { height: 100vh; }
    </style>
</head>
<body>
    <div id="api-reference"></div>
    <script>
        const spec = ${specJson};
        Scalar.createApiReference('#api-reference', {
            spec: { content: spec },
            theme: 'default',
            hideDownloadButton: true,
        });
    </script>
</body>
</html>`
}
