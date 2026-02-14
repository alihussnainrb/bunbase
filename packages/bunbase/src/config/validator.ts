/**
 * Config validation logic with rich error reporting.
 * Validates BunbaseConfig at runtime using Zod.
 */

import { ZodError } from 'zod'
import type { BunbaseConfig } from './types.ts'
import { bunbaseConfigSchema } from './schema.ts'

/**
 * Represents a single validation error with field path and message.
 */
export interface ValidationError {
	/** Dot-separated path to the invalid field (e.g., "auth.sessionSecret") */
	path: string
	/** Human-readable error message */
	message: string
	/** Expected value or type */
	expected?: string
	/** Actual value received */
	received?: unknown
}

/**
 * Custom error class for config validation failures.
 * Contains structured field-level errors for debugging.
 */
export class ConfigValidationError extends Error {
	constructor(
		message: string,
		public readonly errors: ValidationError[],
	) {
		super(message)
		this.name = 'ConfigValidationError'
	}

	/**
	 * Formats the error as a human-readable string with all validation errors.
	 */
	format(): string {
		const lines = [this.message, '']
		for (const err of this.errors) {
			lines.push(`  • ${err.path}: ${err.message}`)
			if (err.expected) {
				lines.push(`    Expected: ${err.expected}`)
			}
			if (err.received !== undefined) {
				lines.push(`    Received: ${JSON.stringify(err.received)}`)
			}
		}
		return lines.join('\n')
	}
}

/**
 * Converts Zod validation errors to structured ValidationError array.
 */
function formatZodError(error: ZodError): ValidationError[] {
	return error.errors.map((err) => {
		const path = err.path.join('.')
		const message = err.message
		const expected = err.code === 'invalid_type' ? err.expected : undefined
		const received = err.code === 'invalid_type' ? err.received : undefined

		return {
			path: path || '<root>',
			message,
			expected: expected?.toString(),
			received,
		}
	})
}

/**
 * Validates the full BunbaseConfig.
 * Throws ConfigValidationError if validation fails.
 *
 * @param config - The config object to validate
 * @returns The validated config (same as input, but type-safe)
 * @throws ConfigValidationError if validation fails
 *
 * @example
 * try {
 *   const config = validateConfig(loadedConfig)
 * } catch (err) {
 *   if (err instanceof ConfigValidationError) {
 *     console.error(err.format())
 *     process.exit(1)
 *   }
 * }
 */
export function validateConfig(config: unknown): BunbaseConfig {
	try {
		return bunbaseConfigSchema.parse(config) as BunbaseConfig
	} catch (err) {
		if (err instanceof ZodError) {
			const errors = formatZodError(err)
			throw new ConfigValidationError(
				'Configuration validation failed',
				errors,
			)
		}
		throw err
	}
}

/**
 * Validates a partial config (useful for CLI commands that only need specific fields).
 * Unlike validateConfig(), this allows missing fields.
 *
 * @param config - The partial config object to validate
 * @returns The validated partial config
 * @throws ConfigValidationError if validation fails
 *
 * @example
 * // Validate only database config for migrate command
 * const dbConfig = validatePartialConfig({ database: { url: '...' } })
 */
export function validatePartialConfig(config: unknown): Partial<BunbaseConfig> {
	try {
		return bunbaseConfigSchema.partial().parse(config) as Partial<BunbaseConfig>
	} catch (err) {
		if (err instanceof ZodError) {
			const errors = formatZodError(err)
			throw new ConfigValidationError(
				'Partial configuration validation failed',
				errors,
			)
		}
		throw err
	}
}

/**
 * Checks if a value is a ConfigValidationError.
 */
export function isConfigValidationError(
	error: unknown,
): error is ConfigValidationError {
	return error instanceof ConfigValidationError
}
