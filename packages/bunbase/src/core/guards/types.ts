import type { ActionContext } from '../types.ts'

export type GuardFn = (ctx: ActionContext) => void | Promise<void>

export class GuardError extends Error {
	constructor(
		message: string,
		public statusCode: number = 403,
	) {
		super(message)
		this.name = 'GuardError'
	}
}

export interface RateLimitOptions {
	limit: number
	windowMs: number
	key?: (ctx: ActionContext) => string
}
