// Built-in error classes for Bunbase actions
// These can be thrown from action handlers and will be properly handled by the server

/**
 * Context metadata attached to errors for better debugging.
 * Includes trace ID, action name, module, and optional user ID.
 */
export interface ErrorContext {
	/** Trace ID for request tracking */
	traceId?: string
	/** Name of the action that threw the error */
	actionName?: string
	/** Module name if action is part of a module */
	moduleName?: string
	/** User ID if authenticated */
	userId?: string
	/** Additional metadata */
	[key: string]: unknown
}

export class BunbaseError extends Error {
	public readonly statusCode: number
	public readonly context?: ErrorContext

	constructor(
		message: string,
		statusCode: number = 500,
		context?: ErrorContext,
	) {
		super(message)
		this.name = 'BunbaseError'
		this.statusCode = statusCode
		this.context = context
	}

	/**
	 * Builder method to attach context to an existing error.
	 * Returns a new error instance with merged context.
	 *
	 * @example
	 * throw new BadRequest('Invalid input').withContext({ traceId: '123' })
	 */
	withContext(context: ErrorContext): this {
		// Create a copy by cloning properties instead of calling constructor
		// This avoids issues with subclass constructor signatures
		const ErrorClass = this.constructor as typeof BunbaseError
		const newError = Object.create(ErrorClass.prototype)
		newError.message = this.message
		newError.name = this.name
		newError.statusCode = this.statusCode
		newError.context = { ...this.context, ...context }
		newError.stack = this.stack
		return newError as this
	}

	/**
	 * Serializes error to JSON for structured logging.
	 * Includes message, status code, name, and context.
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			statusCode: this.statusCode,
			context: this.context,
			stack: this.stack,
		}
	}
}

export class BadRequest extends BunbaseError {
	constructor(message: string = 'Bad Request', context?: ErrorContext) {
		super(message, 400, context)
		this.name = 'BadRequest'
	}
}

export function badRequest(message: string = 'Bad Request'): never {
	throw new BadRequest(message)
}

export class Unauthorized extends BunbaseError {
	constructor(message: string = 'Unauthorized', context?: ErrorContext) {
		super(message, 401, context)
		this.name = 'Unauthorized'
	}
}

export class ActionValidationError extends BunbaseError {
	constructor(message: string = 'Action Validation Error', context?: ErrorContext) {
		super(message, 400, context)
		this.name = 'ActionValidationError'
	}
}

export class Forbidden extends BunbaseError {
	constructor(message: string = 'Forbidden', context?: ErrorContext) {
		super(message, 403, context)
		this.name = 'Forbidden'
	}
}

export class NotFound extends BunbaseError {
	constructor(message: string = 'Not Found', context?: ErrorContext) {
		super(message, 404, context)
		this.name = 'NotFound'
	}
}

export class Conflict extends BunbaseError {
	constructor(message: string = 'Conflict', context?: ErrorContext) {
		super(message, 409, context)
		this.name = 'Conflict'
	}
}

export class TooManyRequests extends BunbaseError {
	constructor(message: string = 'Too Many Requests', context?: ErrorContext) {
		super(message, 429, context)
		this.name = 'TooManyRequests'
	}
}

export class InternalError extends BunbaseError {
	constructor(message: string = 'Internal Server Error', context?: ErrorContext) {
		super(message, 500, context)
		this.name = 'InternalError'
	}
}

export class NotImplemented extends BunbaseError {
	constructor(message: string = 'Not Implemented', context?: ErrorContext) {
		super(message, 501, context)
		this.name = 'NotImplemented'
	}
}

export class ServiceUnavailable extends BunbaseError {
	constructor(message: string = 'Service Unavailable', context?: ErrorContext) {
		super(message, 503, context)
		this.name = 'ServiceUnavailable'
	}
}

// Circular dependency error (when actions call each other in a loop)
export class CircularDependencyError extends BunbaseError {
	constructor(
		public readonly actionName: string,
		public readonly callStack: string[],
		message?: string,
		context?: ErrorContext,
	) {
		super(
			message ||
				`Circular dependency detected: ${callStack.join(' → ')} → ${actionName}`,
			500,
			context,
		)
		this.name = 'CircularDependencyError'
	}
}

// Non-retriable errors (client errors that shouldn't be retried)
export class NonRetriableError extends BunbaseError {
	constructor(message: string = 'Non-Retriable Error', context?: ErrorContext) {
		super(message, 400, context)
		this.name = 'NonRetriableError'
	}
}

// ── Retry Classification ────────────────────────────────

/**
 * Determines whether an error is retryable based on built-in classification.
 *
 * Non-retryable: NonRetriableError, ActionValidationError, GuardError,
 * BunbaseError with statusCode < 500 (client errors)
 *
 * Retryable: BunbaseError with statusCode >= 500 (server errors),
 * generic Error (unknown errors assumed transient)
 */
export function isRetryable(error: unknown): boolean {
	if (!(error instanceof Error)) return false
	if (error instanceof NonRetriableError) return false
	if (error.name === 'ActionValidationError') return false
	if (error.name === 'GuardError') return false
	if (error instanceof BunbaseError) return error.statusCode >= 500
	return true
}
