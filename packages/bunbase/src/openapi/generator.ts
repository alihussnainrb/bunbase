import type {
	OpenApiBuilder,
	OperationObject,
	PathItemObject,
	ResponseObject,
} from 'openapi3-ts/oas31'
import type { TSchema } from 'typebox'
import type { ActionRegistry } from '../core/registry.ts'

export type { OpenApiBuilder }

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
				const path = trigger.path
				const method = trigger.method.toLowerCase() as
					| 'get'
					| 'post'
					| 'put'
					| 'patch'
					| 'delete'

				const config = action.definition.config

				const operation: OperationObject = {
					operationId: config.name,
					summary: config.description,
					description: config.description,
					requestBody: ['post', 'put', 'patch'].includes(method)
						? {
								content: {
									'application/json': {
										schema: typeboxToOpenAPI(config.input) as any,
									},
								},
								required: true,
							}
						: undefined,
					responses: {
						'200': {
							description: 'Success',
							content: {
								'application/json': {
									schema: typeboxToOpenAPI(config.output) as any,
								},
							},
						} as ResponseObject,
						'400': { description: 'Validation error' },
						'401': { description: 'Unauthorized' },
						'403': { description: 'Forbidden' },
						'500': { description: 'Internal server error' },
					},
				}

				builder.addPath(path, { [method]: operation } as PathItemObject)
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
