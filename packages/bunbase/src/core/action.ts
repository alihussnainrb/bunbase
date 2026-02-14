import type { TObject, TSchema } from 'typebox'
import Compile from 'typebox/compile'
import type {} from 'typebox/value'
import { BunbaseError, type ErrorContext } from '../utils/errors.ts'
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
		// Validate input with timing measurement
		const inputValidationStart = performance.now()
		if (!inputValidator.Check(input)) {
			const errors = [...inputValidator.Errors(input)]
			const messages = errors
				.map((e) => `${e.schemaPath}: ${e.message}`)
				.join('; ')
			throw new ActionValidationError('input', messages, errors, {
				traceId: ctx.traceId,
				actionName: config.name,
			})
		}
		const inputValidationDuration = performance.now() - inputValidationStart

		// Warn if input validation is slow (> 100ms)
		if (inputValidationDuration > 100) {
			ctx.logger.warn(
				`Slow input validation: ${inputValidationDuration.toFixed(2)}ms for action "${config.name}"`,
			)
		}

		// Run handler
		const output = await handler(input, ctx)

		// Validate output with timing measurement
		const outputValidationStart = performance.now()
		if (!outputValidator.Check(output)) {
			const errors = [...outputValidator.Errors(output)]
			const messages = errors
				.map((e) => `${e.schemaPath}: ${e.message}`)
				.join('; ')
			throw new ActionValidationError('output', messages, errors, {
				traceId: ctx.traceId,
				actionName: config.name,
			})
		}
		const outputValidationDuration = performance.now() - outputValidationStart

		// Warn if output validation is slow (> 100ms)
		if (outputValidationDuration > 100) {
			ctx.logger.warn(
				`Slow output validation: ${outputValidationDuration.toFixed(2)}ms for action "${config.name}"`,
			)
		}

		return output
	}

	return {
		config,
		handler: wrappedHandler,
	}
}

/**
 * Structured validation error with field path and details.
 */
export interface ValidationErrorDetail {
	/** JSON path to the invalid field (e.g., "/user/email") */
	path: string
	/** Schema path (e.g., "/properties/user/properties/email") */
	schemaPath: string
	/** Human-readable error message */
	message: string
	/** Expected value or type */
	expected?: string
	/** Actual value received */
	value?: unknown
}

/**
 * Validation error thrown when action input or output fails TypeBox validation.
 * Extends BunbaseError to support context and structured error reporting.
 */
export class ActionValidationError extends BunbaseError {
	public readonly phase: 'input' | 'output'
	public readonly validationErrors: ValidationErrorDetail[]

	constructor(
		phase: 'input' | 'output',
		message: string,
		errors: unknown[],
		context?: ErrorContext,
	) {
		super(`Action ${phase} validation failed: ${message}`, 400, context)
		this.name = 'ActionValidationError'
		this.phase = phase
		this.validationErrors = errors.map((err: any) => ({
			path: err.path || '/',
			schemaPath: err.schemaPath || '/',
			message: err.message || 'Validation failed',
			expected: err.schema?.type,
			value: err.value,
		}))
	}

	/**
	 * Formats validation errors as a human-readable string.
	 */
	formatErrors(): string {
		return this.validationErrors
			.map((err) => {
				const parts = [`  • ${err.path}: ${err.message}`]
				if (err.expected) {
					parts.push(`    Expected: ${err.expected}`)
				}
				if (err.value !== undefined) {
					const valueStr =
						typeof err.value === 'object'
							? JSON.stringify(err.value)
							: String(err.value)
					parts.push(`    Received: ${valueStr}`)
				}
				return parts.join('\n')
			})
			.join('\n')
	}

	/**
	 * Override toJSON to include validation errors.
	 */
	override toJSON(): Record<string, unknown> {
		return {
			...super.toJSON(),
			phase: this.phase,
			validationErrors: this.validationErrors,
		}
	}
}
