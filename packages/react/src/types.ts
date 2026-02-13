/**
 * HTTP field metadata for automatic field routing
 */
export interface HttpFieldMetadata {
	location: 'query' | 'header' | 'path' | 'cookie' | 'body'
	paramName?: string
	cookieOptions?: {
		httpOnly?: boolean
		secure?: boolean
		sameSite?: 'strict' | 'lax' | 'none'
		maxAge?: number
		path?: string
		domain?: string
	}
}

/**
 * Base API structure that all generated APIs should follow
 */
export interface BaseAPI {
	[actionName: string]: {
		method?: string
		path?: string
		module?: string
		input: any
		output: any
		_inputFields?: Record<string, HttpFieldMetadata>
		_outputFields?: Record<string, HttpFieldMetadata>
	}
}

/**
 * Extract action name from API
 */
export type ActionName<API extends BaseAPI> = keyof API & string

/**
 * Extract input type for an action
 */
export type ActionInput<
	API extends BaseAPI,
	Action extends ActionName<API>,
> = API[Action]['input']

/**
 * Extract output type for an action
 */
export type ActionOutput<
	API extends BaseAPI,
	Action extends ActionName<API>,
> = API[Action]['output']

/**
 * HTTP method for an action
 */
export type ActionMethod<
	API extends BaseAPI,
	Action extends ActionName<API>,
> = API[Action]['method']

/**
 * Client configuration options
 */
export interface BunbaseClientOptions<API extends BaseAPI = BaseAPI> {
	/**
	 * Base URL of the Bunbase backend
	 * @example "http://localhost:3000"
	 */
	baseUrl: string

	/**
	 * Runtime schema with HTTP field metadata for automatic field routing
	 * Import from generated types: bunbaseAPISchema
	 */
	schema?: API

	/**
	 * Default headers to include in all requests
	 */
	headers?: Record<string, string>

	/**
	 * Request interceptor - modify requests before sending
	 */
	beforeRequest?: (
		action: string,
		input: any,
		init: RequestInit,
	) => Promise<RequestInit> | RequestInit

	/**
	 * Response interceptor - process responses after receiving
	 */
	afterResponse?: (
		action: string,
		response: Response,
	) => Promise<Response> | Response

	/**
	 * Global error handler
	 */
	onError?: (error: BunbaseError) => void

	/**
	 * Fetch implementation (defaults to global fetch)
	 */
	fetch?: typeof fetch
}

/**
 * Bunbase error with status code and details
 */
export class BunbaseError extends Error {
	constructor(
		message: string,
		public status: number,
		public action: string,
		public details?: any,
	) {
		super(message)
		this.name = 'BunbaseError'
	}
}
