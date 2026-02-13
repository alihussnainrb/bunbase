import type { TObject, TSchema } from 'typebox'
import type { ActionRegistry } from '../core/registry.ts'
import type { CookieOptions } from '../utils/typebox.ts'
import { getHttpMetadata } from '../utils/typebox.ts'

/**
 * HTTP metadata for a schema field
 */
export interface HttpFieldMetadata {
	location: 'query' | 'header' | 'path' | 'cookie' | 'body'
	paramName?: string
	cookieOptions?: CookieOptions
}

/**
 * Schema for an action with HTTP metadata preserved
 */
export interface ActionSchema {
	name: string
	description?: string
	moduleName: string | null
	input: {
		schema: TSchema
		fields: Record<string, HttpFieldMetadata>
	}
	output: {
		schema: TSchema
		fields: Record<string, HttpFieldMetadata>
	}
	httpTrigger?: {
		method: string
		path: string
	}
}

/**
 * Complete schema for all actions in the registry
 */
export interface BunbaseSchema {
	version: string
	actions: Record<string, ActionSchema>
}

/**
 * Extract HTTP metadata from a schema's fields
 */
function extractHttpMetadata(schema: TSchema): Record<string, HttpFieldMetadata> {
	const metadata: Record<string, HttpFieldMetadata> = {}

	// Check if schema has properties (TObject)
	if ('properties' in schema && typeof schema.properties === 'object') {
		const objSchema = schema as TObject

		for (const [fieldName, fieldSchema] of Object.entries(
			objSchema.properties,
		)) {
			const httpMeta = getHttpMetadata(fieldSchema, fieldName)

			if (httpMeta) {
				// Has HTTP mapping
				metadata[fieldName] = {
					location: httpMeta.location,
					paramName: httpMeta.paramName,
					cookieOptions: httpMeta.cookieOptions,
				}
			} else {
				// No HTTP mapping = body field
				metadata[fieldName] = {
					location: 'body',
				}
			}
		}
	}

	return metadata
}

/**
 * Generate complete schema for all registered actions
 */
export function generateBunbaseSchema(registry: ActionRegistry): BunbaseSchema {
	const actions: Record<string, ActionSchema> = {}

	for (const action of registry.getAll()) {
		const config = action.definition.config

		// Find HTTP trigger if exists
		const apiTrigger = action.triggers.find((t) => t.type === 'api')
		const httpTrigger = apiTrigger
			? {
					method: apiTrigger.method,
					path: apiTrigger.path,
				}
			: undefined

		actions[config.name] = {
			name: config.name,
			description: config.description,
			moduleName: action.moduleName ?? null,
			input: {
				schema: config.input,
				fields: extractHttpMetadata(config.input),
			},
			output: {
				schema: config.output,
				fields: extractHttpMetadata(config.output),
			},
			httpTrigger,
		}
	}

	return {
		version: '1.0.0',
		actions,
	}
}
