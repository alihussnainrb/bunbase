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

// Non-retriable errors (client errors that shouldn't be retried)
export class NonRetriableError extends BunbaseError {
  constructor(message: string = 'Non-Retriable Error') {
    super(message, 400)
    this.name = 'NonRetriableError'
  }
}
