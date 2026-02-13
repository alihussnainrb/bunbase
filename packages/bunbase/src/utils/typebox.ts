import type { TSchema } from 'typebox'
import { Type } from 'typebox'

export type { TSchema }

type BunbaseMetadata = {
	
}


type TypeWithOpenAPI = typeof Type & {
	
}

/**
 * Extended Type schema builder with Bunbase metadata support.
 */
export const t: TypeWithOpenAPI = {
	...Type,
	String: (opts, metadata?: BunbaseMetadata) => Type.String({...opts, ...metadata}),
	Number: (opts, metadata?: BunbaseMetadata) => Type.Number({...opts, ...metadata}),
	Integer: (opts, metadata?: BunbaseMetadata) => Type.Integer({...opts, ...metadata}),
	Boolean: (opts, metadata?: BunbaseMetadata) => Type.Boolean({...opts, ...metadata}),
	Object: (properties, opts, metadata?: BunbaseMetadata) => Type.Object(properties, {...opts, ...metadata}),
	Array: (items, opts, metadata?: BunbaseMetadata) => Type.Array(items, {...opts, ...metadata}),
	Union: (schemas, opts, metadata?: BunbaseMetadata) => Type.Union(schemas, {...opts, ...metadata}),
	Intersect: (schemas, opts, metadata?: BunbaseMetadata) => Type.Intersect(schemas, {...opts, ...metadata}),
	Literal: (value, opts, metadata?: BunbaseMetadata) => Type.Literal(value, {...opts, ...metadata}),
	Any: (opts, metadata?: BunbaseMetadata) => Type.Any({...opts, ...metadata}),
}

export default t
