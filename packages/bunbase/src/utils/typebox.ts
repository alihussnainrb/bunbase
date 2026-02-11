import type { TSchema } from 'typebox'
import { Type } from 'typebox'

export type { TSchema }

type OpenAPIMetadata = {
	description?: string
	example?: unknown
	examples?: unknown[]
	title?: string
	deprecated?: boolean
	readOnly?: boolean
	writeOnly?: boolean
}

type TypeWithOpenAPI = typeof Type & {
	string: (
		opts?: {
			description?: string
			example?: string
			examples?: string[]
			format?: string
			minLength?: number
			maxLength?: number
			pattern?: string
			default?: string
		} & Record<string, unknown>,
	) => TSchema & OpenAPIMetadata
	number: (
		opts?: {
			description?: string
			example?: number
			examples?: number[]
			format?: string
			minimum?: number
			maximum?: number
			exclusiveMinimum?: number
			exclusiveMaximum?: number
			multipleOf?: number
			default?: number
		} & Record<string, unknown>,
	) => TSchema & OpenAPIMetadata
	integer: (
		opts?: {
			description?: string
			example?: number
			examples?: number[]
			format?: string
			minimum?: number
			maximum?: number
			default?: number
		} & Record<string, unknown>,
	) => TSchema & OpenAPIMetadata
	boolean: (
		opts?: {
			description?: string
			example?: boolean
			examples?: boolean[]
			default?: boolean
		} & Record<string, unknown>,
	) => TSchema & OpenAPIMetadata
	object: <T extends Record<string, TSchema>>(
		properties: T,
		opts?: {
			description?: string
			title?: string
			example?: Record<string, unknown>
			examples?: Record<string, unknown>[]
			deprecated?: boolean
			additionalProperties?: boolean
			minProperties?: number
			maxProperties?: number
		} & Record<string, unknown>,
	) => TSchema & OpenAPIMetadata
	array: <T extends TSchema>(
		items: T,
		opts?: {
			description?: string
			example?: unknown[]
			examples?: unknown[][]
			minItems?: number
			maxItems?: number
			uniqueItems?: boolean
		} & Record<string, unknown>,
	) => TSchema & OpenAPIMetadata
	enum: <T extends string[]>(
		values: T,
		opts?: {
			description?: string
			example?: T[number]
			examples?: T[number][]
			title?: string
		},
	) => TSchema & OpenAPIMetadata
	literal: <T extends string | number | boolean>(
		value: T,
		opts?: { description?: string; title?: string },
	) => TSchema & OpenAPIMetadata
	optional: <T extends TSchema>(schema: T) => TSchema
	nullable: <T extends TSchema>(
		schema: T,
		opts?: { description?: string },
	) => TSchema & OpenAPIMetadata
	readOnly: <T extends TSchema>(
		schema: T,
		opts?: { description?: string },
	) => TSchema & OpenAPIMetadata
	writeOnly: <T extends TSchema>(
		schema: T,
		opts?: { description?: string },
	) => TSchema & OpenAPIMetadata
	deprecated: <T extends TSchema>(
		schema: T,
		opts?: { description?: string },
	) => TSchema & OpenAPIMetadata
}

/**
 * Extended Type schema builder with OpenAPI metadata support.
 */
export const t: TypeWithOpenAPI = {
	// Re-export all original Type types
	...Type,

	/**
	 * String with OpenAPI metadata.
	 * @example t.string({ description: 'User email', example: 'user@example.com', format: 'email' })
	 */
	string: (
		opts: {
			description?: string
			example?: string
			examples?: string[]
			format?:
				| 'email'
				| 'date'
				| 'date-time'
				| 'uuid'
				| 'uri'
				| 'hostname'
				| 'ipv4'
				| 'ipv6'
				| string
			minLength?: number
			maxLength?: number
			pattern?: string
			default?: string
		} = {},
	): TSchema => {
		const { description, example, examples, format, ...rest } = opts
		const schema = Type.String(rest)

		// Add OpenAPI extensions
		if (description || example || examples || format) {
			return Object.assign({}, schema, {
				...(description && { description }),
				...(example && { example }),
				...(examples && { examples }),
				...(format && { format }),
			})
		}
		return schema
	},

	/**
	 * Number with OpenAPI metadata.
	 * @example t.number({ description: 'User age', example: 25, minimum: 0, maximum: 150 })
	 */
	number: (
		opts: {
			description?: string
			example?: number
			examples?: number[]
			format?: 'float' | 'double' | string
			minimum?: number
			maximum?: number
			exclusiveMinimum?: number
			exclusiveMaximum?: number
			multipleOf?: number
			default?: number
		} = {},
	): TSchema => {
		const { description, example, examples, format, ...rest } = opts
		const schema = Type.Number(rest)

		if (description || example || examples || format) {
			return Object.assign({}, schema, {
				...(description && { description }),
				...(example && { example }),
				...(examples && { examples }),
				...(format && { format }),
			})
		}
		return schema
	},

	/**
	 * Integer with OpenAPI metadata.
	 * @example t.integer({ description: 'Count', example: 10, minimum: 0 })
	 */
	integer: (
		opts: {
			description?: string
			example?: number
			examples?: number[]
			format?: 'int32' | 'int64' | string
			minimum?: number
			maximum?: number
			default?: number
		} = {},
	): TSchema => {
		const { description, example, examples, format, ...rest } = opts
		const schema = Type.Integer(rest)

		if (description || example || examples || format) {
			return Object.assign({}, schema, {
				...(description && { description }),
				...(example && { example }),
				...(examples && { examples }),
				...(format && { format }),
			})
		}
		return schema
	},

	/**
	 * Boolean with OpenAPI metadata.
	 * @example t.boolean({ description: 'Is active', example: true })
	 */
	boolean: (
		opts: {
			description?: string
			example?: boolean
			examples?: boolean[]
		} = {},
	): TSchema => {
		const { description, example, examples, ...rest } = opts
		const schema = Type.Boolean(rest)

		if (description || example || examples) {
			return Object.assign({}, schema, {
				...(description && { description }),
				...(example && { example }),
				...(examples && { examples }),
			})
		}
		return schema
	},

	/**
	 * Object with OpenAPI metadata.
	 * @example t.object({ name: t.string() }, { description: 'User object', title: 'User' })
	 */
	object: <T extends Record<string, TSchema>>(
		properties: T,
		opts: {
			description?: string
			title?: string
			example?: Record<string, unknown>
			examples?: Record<string, unknown>[]
			deprecated?: boolean
			additionalProperties?: boolean
			minProperties?: number
			maxProperties?: number
		} = {},
	): TSchema => {
		const { description, title, example, examples, deprecated, ...rest } = opts
		const schema = Type.Object(properties, rest)

		if (description || title || example || examples || deprecated) {
			return Object.assign({}, schema, {
				...(description && { description }),
				...(title && { title }),
				...(example && { example }),
				...(examples && { examples }),
				...(deprecated && { deprecated }),
			})
		}
		return schema
	},

	/**
	 * Array with OpenAPI metadata.
	 * @example t.array(t.string(), { description: 'List of tags', example: ['tag1', 'tag2'] })
	 */
	array: <T extends TSchema>(
		items: T,
		opts: {
			description?: string
			example?: unknown[]
			examples?: unknown[][]
			minItems?: number
			maxItems?: number
			uniqueItems?: boolean
		} = {},
	): TSchema => {
		const { description, example, examples, ...rest } = opts
		const schema = Type.Array(items, rest)

		if (description || example || examples) {
			return Object.assign({}, schema, {
				...(description && { description }),
				...(example && { example }),
				...(examples && { examples }),
			})
		}
		return schema
	},

	/**
	 * Enum / String literal union with OpenAPI metadata.
	 * @example t.enum(['active', 'inactive'], { description: 'User status', example: 'active' })
	 */
	enum: <T extends string[]>(
		values: T,
		opts: {
			description?: string
			example?: T[number]
			examples?: T[number][]
			title?: string
		} = {},
	): TSchema => {
		const schema = Type.Union(values.map((v) => Type.Literal(v)))

		if (opts.description || opts.example || opts.examples || opts.title) {
			return Object.assign({}, schema, {
				...(opts.description && { description: opts.description }),
				...(opts.example && { example: opts.example }),
				...(opts.examples && { examples: opts.examples }),
				...(opts.title && { title: opts.title }),
				// Make it look like a string enum in OpenAPI
				type: 'string',
				enum: values,
			})
		}
		return schema
	},

	/**
	 * Literal value with OpenAPI metadata.
	 * @example t.literal('pending', { description: 'Pending status' })
	 */
	literal: <T extends string | number | boolean>(
		value: T,
		opts: {
			description?: string
			title?: string
		} = {},
	): TSchema => {
		const schema = Type.Literal(value)

		if (opts.description || opts.title) {
			return Object.assign({}, schema, {
				...(opts.description && { description: opts.description }),
				...(opts.title && { title: opts.title }),
			})
		}
		return schema
	},

	/**
	 * Optional wrapper - marks field as not required.
	 * Alias for Type.Optional.
	 */
	optional: <T extends TSchema>(schema: T): TSchema => Type.Optional(schema),

	/**
	 * Nullable wrapper - marks field as nullable.
	 * @example t.nullable(t.string(), { description: 'Optional email' })
	 */
	nullable: <T extends TSchema>(
		schema: T,
		opts: { description?: string } = {},
	): TSchema => {
		const nullableSchema = Type.Union([schema, Type.Null()])

		if (opts.description) {
			return Object.assign({}, nullableSchema, {
				description: opts.description,
			})
		}
		return nullableSchema
	},

	/**
	 * Read-only field wrapper.
	 * @example t.readOnly(t.string(), { description: 'Read-only ID' })
	 */
	readOnly: <T extends TSchema>(
		schema: T,
		opts: { description?: string } = {},
	): TSchema => {
		const modified = Object.assign({}, schema, { readOnly: true })

		if (opts.description) {
			return Object.assign({}, modified, { description: opts.description })
		}
		return modified
	},

	/**
	 * Write-only field wrapper (e.g., passwords).
	 * @example t.writeOnly(t.string(), { description: 'Password', format: 'password' })
	 */
	writeOnly: <T extends TSchema>(
		schema: T,
		opts: { description?: string } = {},
	): TSchema => {
		const modified = Object.assign({}, schema, { writeOnly: true })

		if (opts.description) {
			return Object.assign({}, modified, { description: opts.description })
		}
		return modified
	},

	/**
	 * Deprecated field marker.
	 * @example t.deprecated(t.string(), { description: 'Old field, use newField instead' })
	 */
	deprecated: <T extends TSchema>(
		schema: T,
		opts: { description?: string } = {},
	): TSchema => {
		const modified = Object.assign({}, schema, { deprecated: true })

		if (opts.description) {
			return Object.assign({}, modified, { description: opts.description })
		}
		return modified
	},
}

export default t
