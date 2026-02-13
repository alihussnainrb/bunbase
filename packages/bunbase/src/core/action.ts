import type { TObject, TSchema } from 'typebox'
import Compile from 'typebox/compile'
import type {} from 'typebox/value'
import { getHttpMetadata } from '../utils/typebox.ts'
import type { ActionConfig, ActionDefinition, ActionHandler } from './types.ts'

/**
 * Validate that output schema doesn't use input-only HTTP mappings
 */
function validateOutputSchema(schema: TObject): void {
	for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
		const meta = getHttpMetadata(fieldSchema, fieldName)
		if (!meta) continue

		// Query and path are input-only
		if (meta.location === 'query' || meta.location === 'path') {
			throw new Error(
				`Invalid output schema: Field "${fieldName}" uses http.${meta.location === 'query' ? 'Query' : 'Path'}() which is only valid in input schemas. ` +
					'Query parameters and path parameters are input-only and cannot be set in the response.',
			)
		}
	}
}

/**
 * Define an action — the core primitive of bunbase.
 *
 * @example
 * ```ts
 * import { action, t } from 'bunbase'
 *
 * export const createUser = action({
 *   name: 'createUser',
 *   input: t.Object({ email: t.String() }),
 *   output: t.Object({ id: t.String() }),
 * }, async (input, ctx) => {
 *   return { id: '123' }
 * })
 * ```
 */
export function action<TInput extends TSchema, TOutput extends TSchema>(
	config: ActionConfig<TInput, TOutput>,
	handler: ActionHandler<TInput, TOutput>,
): ActionDefinition<TInput, TOutput> {
	// Validate output schema doesn't use input-only mappings
	if (
		'properties' in config.output &&
		typeof config.output.properties === 'object'
	) {
		validateOutputSchema(config.output as unknown as TObject)
	}

	// Pre-compile TypeBox validators at definition time for performance
	const inputValidator = Compile(config.input)
	const outputValidator = Compile(config.output)

	const wrappedHandler: ActionHandler<TInput, TOutput> = async (input, ctx) => {
		// Validate input
		if (!inputValidator.Check(input)) {
			const errors = [...inputValidator.Errors(input)]
			const messages = errors
				.map((e) => `${e.schemaPath}: ${e.message}`)
				.join('; ')
			throw new ActionValidationError('input', messages, errors)
		}

		// Run handler
		const output = await handler(input, ctx)

		// Validate output
		if (!outputValidator.Check(output)) {
			const errors = [...outputValidator.Errors(output)]
			const messages = errors
				.map((e) => `${e.schemaPath}: ${e.message}`)
				.join('; ')
			throw new ActionValidationError('output', messages, errors)
		}

		return output
	}

	return {
		config,
		handler: wrappedHandler,
	}
}

/**
 * Validation error thrown when action input or output fails TypeBox validation.
 */
export class ActionValidationError extends Error {
	public readonly phase: 'input' | 'output'
	public readonly validationErrors: unknown[]

	constructor(phase: 'input' | 'output', message: string, errors: unknown[]) {
		super(`Action ${phase} validation failed: ${message}`)
		this.name = 'ActionValidationError'
		this.phase = phase
		this.validationErrors = errors
	}
}
