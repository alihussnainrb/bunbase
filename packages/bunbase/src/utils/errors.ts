// Built-in error classes for Bunbase actions
// These can be thrown from action handlers and will be properly handled by the server

export class BunbaseError extends Error {
	public readonly statusCode: number

	constructor(message: string, statusCode: number = 500) {
		super(message)
		this.name = 'BunbaseError'
		this.statusCode = statusCode
	}
}

export class BadRequest extends BunbaseError {
	constructor(message: string = 'Bad Request') {
		super(message, 400)
		this.name = 'BadRequest'
	}
}

export class Unauthorized extends BunbaseError {
	constructor(message: string = 'Unauthorized') {
		super(message, 401)
		this.name = 'Unauthorized'
	}
}

export class Forbidden extends BunbaseError {
	constructor(message: string = 'Forbidden') {
		super(message, 403)
		this.name = 'Forbidden'
	}
}

export class NotFound extends BunbaseError {
	constructor(message: string = 'Not Found') {
		super(message, 404)
		this.name = 'NotFound'
	}
}

export class Conflict extends BunbaseError {
	constructor(message: string = 'Conflict') {
		super(message, 409)
		this.name = 'Conflict'
	}
}

export class TooManyRequests extends BunbaseError {
	constructor(message: string = 'Too Many Requests') {
		super(message, 429)
		this.name = 'TooManyRequests'
	}
}

export class InternalError extends BunbaseError {
	constructor(message: string = 'Internal Server Error') {
		super(message, 500)
		this.name = 'InternalError'
	}
}

export class NotImplemented extends BunbaseError {
	constructor(message: string = 'Not Implemented') {
		super(message, 501)
		this.name = 'NotImplemented'
	}
}

export class ServiceUnavailable extends BunbaseError {
	constructor(message: string = 'Service Unavailable') {
		super(message, 503)
		this.name = 'ServiceUnavailable'
	}
}

// Circular dependency error (when actions call each other in a loop)
export class CircularDependencyError extends BunbaseError {
	constructor(
		public readonly actionName: string,
		public readonly callStack: string[],
		message?: string,
	) {
		super(
			message ||
				`Circular dependency detected: ${callStack.join(' → ')} → ${actionName}`,
			500,
		)
		this.name = 'CircularDependencyError'
	}
}

// Non-retriable errors (client errors that shouldn't be retried)
export class NonRetriableError extends BunbaseError {
	constructor(message: string = 'Non-Retriable Error') {
		super(message, 400)
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
