import type {
	ActionInput,
	ActionName,
	ActionOutput,
	BaseAPI,
	BunbaseClientOptions,
	BunbaseError,
} from './types.ts'

/**
 * Core Bunbase client for making API calls
 */
export class BunbaseClient<API extends BaseAPI> {
	private baseUrl: string
	private defaultHeaders: Record<string, string>
	private beforeRequest?: BunbaseClientOptions['beforeRequest']
	private afterResponse?: BunbaseClientOptions['afterResponse']
	private onError?: BunbaseClientOptions['onError']
	private fetchImpl: typeof fetch

	constructor(options: BunbaseClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, '') // Remove trailing slash
		this.defaultHeaders = options.headers || {}
		this.beforeRequest = options.beforeRequest
		this.afterResponse = options.afterResponse
		this.onError = options.onError
		this.fetchImpl = options.fetch || fetch
	}

	/**
	 * Make a direct API call
	 */
	async call<Action extends ActionName<API>>(
		action: Action,
		input?: ActionInput<API, Action>,
	): Promise<ActionOutput<API, Action>> {
		try {
			// Construct URL
			const url = `${this.baseUrl}/api/${action}`

			// Prepare request init
			let init: RequestInit = {
				method: 'POST', // Bunbase actions default to POST
				headers: {
					'Content-Type': 'application/json',
					...this.defaultHeaders,
				},
			}

			// Add body if input provided
			if (input !== undefined && input !== null) {
				init.body = JSON.stringify(input)
			}

			// Apply request interceptor
			if (this.beforeRequest) {
				init = await this.beforeRequest(action, input, init)
			}

			// Make request
			let response = await this.fetchImpl(url, init)

			// Apply response interceptor
			if (this.afterResponse) {
				response = await this.afterResponse(action, response)
			}

			// Handle errors
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				const error: BunbaseError = {
					name: 'BunbaseError',
					message: errorData.error || `Request failed with status ${response.status}`,
					status: response.status,
					action,
					details: errorData,
				} as BunbaseError

				if (this.onError) {
					this.onError(error)
				}

				throw error
			}

			// Parse response
			const data = await response.json()

			// Bunbase wraps responses in { data: ... }
			return data.data !== undefined ? data.data : data
		} catch (error) {
			// Re-throw BunbaseError as-is
			if ((error as any).name === 'BunbaseError') {
				throw error
			}

			// Wrap other errors
			const bunbaseError: BunbaseError = {
				name: 'BunbaseError',
				message: error instanceof Error ? error.message : 'Unknown error',
				status: 0,
				action,
				details: error,
			} as BunbaseError

			if (this.onError) {
				this.onError(bunbaseError)
			}

			throw bunbaseError
		}
	}

	/**
	 * Update client configuration
	 */
	setHeaders(headers: Record<string, string>): void {
		this.defaultHeaders = { ...this.defaultHeaders, ...headers }
	}

	/**
	 * Get current headers
	 */
	getHeaders(): Record<string, string> {
		return { ...this.defaultHeaders }
	}

	/**
	 * Update base URL
	 */
	setBaseUrl(baseUrl: string): void {
		this.baseUrl = baseUrl.replace(/\/$/, '')
	}

	/**
	 * Get current base URL
	 */
	getBaseUrl(): string {
		return this.baseUrl
	}
}
