import type {
	ActionInput,
	ActionName,
	ActionOutput,
	BaseAPI,
	BunbaseClientOptions,
	HttpFieldMetadata,
} from './types.ts'

import { BunbaseError } from './types.ts'

/**
 * Split input object into HTTP components based on field metadata
 */
function splitInput(
	input: Record<string, any>,
	metadata: Record<string, HttpFieldMetadata>,
): {
	body: Record<string, any>
	query: Record<string, string>
	headers: Record<string, string>
	cookies: Record<string, string>
	path: Record<string, string>
} {
	const body: Record<string, any> = {}
	const query: Record<string, string> = {}
	const headers: Record<string, string> = {}
	const cookies: Record<string, string> = {}
	const path: Record<string, string> = {}

	for (const [fieldName, value] of Object.entries(input)) {
		if (value === undefined) continue

		const meta = metadata[fieldName]
		if (!meta || meta.location === 'body') {
			body[fieldName] = value
			continue
		}

		const paramName = meta.paramName || fieldName

		switch (meta.location) {
			case 'query':
				query[paramName] = String(value)
				break
			case 'header':
				headers[paramName] = String(value)
				break
			case 'cookie':
				cookies[paramName] = String(value)
				break
			case 'path':
				path[paramName] = String(value)
				break
		}
	}

	return { body, query, headers, cookies, path }
}

/**
 * Merge response body with extracted headers and cookies
 */
function mergeOutput(
	body: Record<string, any>,
	response: Response,
	metadata: Record<string, HttpFieldMetadata>,
): Record<string, any> {
	const output = { ...body }

	for (const [fieldName, meta] of Object.entries(metadata)) {
		if (!meta || meta.location === 'body') continue

		const paramName = meta.paramName || fieldName

		switch (meta.location) {
			case 'header': {
				const value = response.headers.get(paramName)
				if (value !== null) {
					output[fieldName] = value
				}
				break
			}
			case 'cookie': {
				// Parse Set-Cookie headers
				const setCookie = response.headers.get('set-cookie')
				if (setCookie) {
					// Simple cookie parsing - extract value for this cookie name
					const cookieMatch = setCookie.match(
						new RegExp(`${paramName}=([^;]+)`),
					)
					if (cookieMatch?.[1]) {
						output[fieldName] = decodeURIComponent(cookieMatch[1])
					}
				}
				break
			}
		}
	}

	return output
}

/**
 * Core Bunbase client for making API calls
 */
export class BunbaseClient<API extends BaseAPI> {
	private baseUrl: string
	private defaultHeaders: Record<string, string>
	private beforeRequest?: BunbaseClientOptions<API>['beforeRequest']
	private afterResponse?: BunbaseClientOptions<API>['afterResponse']
	private onError?: BunbaseClientOptions<API>['onError']
	private fetchImpl: typeof fetch
	private schema?: API

	constructor(options: BunbaseClientOptions<API>) {
		this.baseUrl = options.baseUrl.replace(/\/$/, '') // Remove trailing slash
		this.defaultHeaders = options.headers || {}
		this.beforeRequest = options.beforeRequest
		this.afterResponse = options.afterResponse
		this.onError = options.onError
		this.fetchImpl = options.fetch || fetch
		this.schema = options.schema
	}

	/**
	 * Make a direct API call with automatic HTTP field routing
	 */
	async call<Action extends ActionName<API>>(
		action: Action,
		input?: ActionInput<API, Action>,
	): Promise<ActionOutput<API, Action>> {
		try {
			// Get action metadata from schema
			const actionMeta = this.schema?.[action] as any
			const inputFields = actionMeta?._inputFields || {}
			const outputFields = actionMeta?._outputFields || {}
			const method = actionMeta?.method || 'POST'
			let path = actionMeta?.path || `/api/${action}`

			// Split input into HTTP components
			const inputObj = (input as Record<string, any>) || {}
			const {
				body,
				query,
				headers,
				cookies,
				path: pathParams,
			} = splitInput(inputObj, inputFields)

			// Replace path parameters
			for (const [paramName, value] of Object.entries(pathParams)) {
				path = path.replace(`:${paramName}`, value)
			}

			// Build URL with query parameters
			const url = new URL(path, this.baseUrl)
			for (const [key, value] of Object.entries(query)) {
				url.searchParams.set(key, value)
			}

			// Prepare request init
			let init: RequestInit = {
				method,
				headers: {
					'Content-Type': 'application/json',
					...this.defaultHeaders,
					...headers, // Add field-mapped headers
				},
				credentials: 'include', // Include cookies
			}

			// Add cookies to request (via Cookie header if not using credentials)
			if (Object.keys(cookies).length > 0) {
				const cookieHeader = Object.entries(cookies)
					.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
					.join('; ')
				init.headers = { ...init.headers, Cookie: cookieHeader }
			}

			// Add body if there are body fields
			if (Object.keys(body).length > 0) {
				init.body = JSON.stringify(body)
			}

			// Apply request interceptor
			if (this.beforeRequest) {
				init = await this.beforeRequest(action, input, init)
			}

			// Make request
			let response = await this.fetchImpl(url.toString(), init)

			// Apply response interceptor
			if (this.afterResponse) {
				response = await this.afterResponse(action, response)
			}

			// Handle errors
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				const error = new BunbaseError(
					errorData.error || `Request failed with status ${response.status}`,
					response.status,
					action,
					errorData,
				)

				if (this.onError) {
					this.onError(error)
				}

				throw error
			}

			// Parse response body
			const data = await response.json()
			const bodyData = data.data !== undefined ? data.data : data

			// Merge response with extracted headers and cookies
			const output = mergeOutput(bodyData, response, outputFields)

			return output as ActionOutput<API, Action>
		} catch (error) {
			// Re-throw BunbaseError as-is
			if (error instanceof BunbaseError) {
				throw error
			}

			// Wrap other errors
			const bunbaseError = new BunbaseError(
				error instanceof Error ? error.message : 'Unknown error',
				0,
				action,
				error,
			)

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
