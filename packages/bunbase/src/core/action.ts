import type { TSchema } from 'typebox'
import Compile from 'typebox/compile'
import type {} from 'typebox/value'
import type { ActionConfig, ActionDefinition, ActionHandler } from './types.ts'

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
