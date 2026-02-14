import type { Server } from 'bun'
import { CookieMap } from 'bun'
import { SessionManager } from '../auth/session.ts'
import type { BunbaseConfig } from '../config/types.ts'
import { GuardError } from '../core/guards/types.ts'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ApiTriggerConfig, WebhookTriggerConfig } from '../core/types.ts'
import type { DatabaseClient } from '../db/client.ts'
import type { KVStore } from '../kv/types.ts'
import type { Logger } from '../logger/index.ts'
import { getMetricsCollector } from '../observability/metrics.ts'
import type { MetricsCollector } from '../observability/metrics.ts'
import {
	generateOpenAPISpec,
	generateScalarDocs,
} from '../openapi/generator.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import type { ChannelManager } from '../realtime/channel-manager.ts'
import { WebSocketHandler } from '../realtime/websocket-handler.ts'
import { generateBunbaseSchema } from '../schema/generator.ts'
import type { StorageAdapter } from '../storage/types.ts'
import { studioModule } from '../studio/module.ts'
import { BunbaseError } from '../utils/errors.ts'
import { eventBus } from './event-bus.ts'
import { executeAction } from './executor.ts'
import { McpService } from './mcp-server.ts'
import type { Queue } from './queue.ts'
import { mapRequestToInput } from './request-mapper.ts'
import { Scheduler } from './scheduler.ts'
import {
	mapOutputToResponse,
	serializeCookie,
} from '../utils/request-mapper.ts'

export interface ServerServices {
	db?: DatabaseClient
	sql?: import('bun').SQL
	storage?: StorageAdapter
	mailer?: import('../mailer/types.ts').MailerAdapter
	kv?: KVStore
	redis?: import('bun').RedisClient
}

interface Route {
	method: string
	pattern: string
	action: RegisteredAction
	trigger: ApiTriggerConfig | WebhookTriggerConfig
}

/**
 * Bun HTTP server with route registration from action triggers.
 */
export class BunbaseServer {
	private routes = new Map<string, Route>()
	private routePatterns: Route[] = []
	private routeHandlers = new Map<
		string,
		(req: Request) => Response | Promise<Response>
	>()
	private server: Server<any> | null = null
	private scheduler?: Scheduler
	private queue?: Queue
	private mcp: McpService
	private sessionManager?: SessionManager
	private wsHandler?: WebSocketHandler
	private config?: BunbaseConfig
	private openapiConfig?: BunbaseConfig['openapi']
	private studioConfig?: BunbaseConfig['studio']
	private corsConfig?: BunbaseConfig['cors']
	private realtimeConfig?: BunbaseConfig['realtime']
	private observabilityConfig?: BunbaseConfig['observability']
	private metrics?: MetricsCollector

	constructor(
		private readonly registry: ActionRegistry,
		private readonly logger: Logger,
		private readonly writeBuffer: WriteBuffer,
		config: BunbaseConfig | undefined,
		private readonly services: ServerServices | undefined,
	) {
		this.mcp = new McpService(registry, logger, writeBuffer)
		this.config = config
		this.openapiConfig = config?.openapi
		this.studioConfig = config?.studio
		this.corsConfig = config?.cors
		this.realtimeConfig = config?.realtime
		this.observabilityConfig = config?.observability

		// Initialize metrics if enabled
		const isProduction = process.env.NODE_ENV === 'production'
		const observabilityEnabled = this.observabilityConfig?.enabled ?? isProduction
		const metricsConfig = this.observabilityConfig?.metrics
		const metricsEnabled = observabilityEnabled && (metricsConfig?.enabled ?? true)

		if (metricsEnabled) {
			this.metrics = getMetricsCollector({
				latencyBuckets: metricsConfig?.latencyBuckets,
				includeDefaultMetrics: metricsConfig?.includeDefaultMetrics,
			})
		}
		if (config?.auth) {
			this.sessionManager = new SessionManager({
				secret: config.auth.sessionSecret,
				cookieName: config.auth.cookie?.name,
				expiresIn: config.auth.expiresIn,
			})
		}

		// Create WebSocket handler if realtime is enabled
		if (this.realtimeConfig?.enabled) {
			this.wsHandler = new WebSocketHandler(
				this.realtimeConfig,
				this.logger,
				this.sessionManager,
			)
		}

		// Register studio actions if studio is enabled
		if (this.studioConfig?.enabled) {
			this.registry.registerModule(studioModule)
		}

		// Create scheduler for cron-triggered actions
		if (services?.sql) {
			this.scheduler = new Scheduler(
				registry,
				logger,
				writeBuffer,
				services.sql,
				config,
				services.redis,
			)
		}
	}

	/**
	 * Get the channel manager for realtime pub/sub (if enabled).
	 */
	getChannelManager(): ChannelManager | null {
		return this.wsHandler?.channelManager ?? null
	}

	/**
	 * Register scheduler for cron-triggered actions.
	 */
	setScheduler(scheduler: Scheduler): void {
		this.scheduler = scheduler
	}

	/**
	 * Register queue for background job processing.
	 */
	setQueue(queue: Queue): void {
		this.queue = queue
	}

	/**
	 * Register a job handler for ctx.queue support.
	 */
	registerJob(
		name: string,
		handler: (data: unknown, ctx: any) => Promise<void>,
	): void {
		this.queue?.register(name, handler)
	}

	/**
	 * Handle health check requests.
	 * @param type - 'live' (server is running), 'ready' (can handle requests), or 'full' (check dependencies)
	 */
	private async handleHealthCheck(
		type: 'live' | 'ready' | 'full',
	): Promise<Response> {
		const timestamp = Date.now()
		const uptime = process.uptime()

		// Liveness check: always returns 200 if server is running
		if (type === 'live') {
			return Response.json({
				status: 'ok',
				timestamp,
				uptime: Math.floor(uptime),
			})
		}

		// Readiness and full checks: verify dependencies
		const checks: Record<
			string,
			{ status: 'ok' | 'error'; latency?: number; error?: string }
		> = {}

		// Check database connection
		if (this.services?.sql) {
			try {
				const start = performance.now()
				await this.services.sql`SELECT 1`
				const latency = Math.round(performance.now() - start)
				checks.database = { status: 'ok', latency }
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				checks.database = { status: 'error', error: message }
			}
		}

		// Check Redis connection (if configured)
		if (this.services?.redis && type === 'full') {
			try {
				const start = performance.now()
				await this.services.redis.ping()
				const latency = Math.round(performance.now() - start)
				checks.redis = { status: 'ok', latency }
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				checks.redis = { status: 'error', error: message }
			}
		}

		// Determine overall status
		const allHealthy = Object.values(checks).every(
			(check) => check.status === 'ok',
		)
		const status = allHealthy ? 'ok' : 'degraded'
		const statusCode = allHealthy ? 200 : 503

		const response: Record<string, unknown> = {
			status,
			timestamp,
			uptime: Math.floor(uptime),
			checks,
		}

		// Include registry info in full health check
		if (type === 'full') {
			response.registry = {
				actions: this.registry.size,
				locked: this.registry.isLocked(),
			}
		}

		return Response.json(response, { status: statusCode })
	}

	/**
	 * Export metrics in Prometheus text format
	 */
	private handleMetricsExport(): Response {
		if (!this.metrics) {
			return new Response('Metrics collection is disabled', { status: 404 })
		}

		const { contentType, body } = this.metrics.export()
		return new Response(body, {
			headers: {
				'Content-Type': contentType,
			},
		})
	}

	/**
	 * Record HTTP request metrics
	 */
	private recordHttpMetrics(
		method: string,
		path: string,
		status: number,
		durationMs: number,
	): void {
		if (!this.metrics) return

		// Normalize path to avoid high cardinality (replace IDs with placeholders)
		const normalizedPath = this.normalizePath(path)

		// Increment request counter
		this.metrics.incrementCounter('bunbase_http_requests_total', 'Total HTTP requests', {
			labels: { method, path: normalizedPath, status: String(status) },
		})

		// Record request duration
		this.metrics.observeHistogram(
			'bunbase_http_request_duration_ms',
			'HTTP request duration in milliseconds',
			durationMs,
			{ labels: { method, path: normalizedPath } },
		)
	}

	/**
	 * Normalize path to reduce cardinality (replace IDs with placeholders)
	 */
	private normalizePath(path: string): string {
		// Replace UUIDs
		path = path.replace(
			/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
			':id',
		)
		// Replace numeric IDs
		path = path.replace(/\/\d+(?:\/|$)/g, '/:id$1')
		return path
	}

	/**
	 * Register event listeners for all actions with event triggers.
	 */
	registerEventListeners(): void {
		for (const action of this.registry.getAll()) {
			for (const trigger of action.triggers) {
				if (trigger.type === 'event') {
					eventBus.on(trigger.event, async (payload) => {
						try {
							const input = trigger.map ? trigger.map(payload) : payload
							const result = await executeAction(action, input, {
								triggerType: 'event',
								logger: this.logger,
								writeBuffer: this.writeBuffer,
								db: this.services?.db,
								storage: this.services?.storage,
								mailer: this.services?.mailer,
								kv: this.services?.kv,
								redis: this.services?.redis,
								channelManager: this.getChannelManager(),
								config: this.config,
								registry: this.registry,
							})

							// Log event metadata if present
							if (result.success && result.transportMeta?.event) {
								const eventMeta = result.transportMeta.event
								this.logger.debug(`Event metadata for ${trigger.event}:`, {
									broadcast: eventMeta.broadcast,
									priority: eventMeta.priority,
									delay: eventMeta.delay,
								})
							}
						} catch (err: unknown) {
							this.logger.error(
								`Error handling event ${trigger.event} for action ${action.definition.config.name}:`,
								err,
							)
						}
					})
				}
			}
		}
	}

	/**
	 * Build routes from all registered actions' API + webhook triggers.
	 */
	buildRoutes(): void {
		for (const action of this.registry.getAll()) {
			for (const trigger of action.triggers) {
				if (trigger.type === 'api') {
					const routeKey = `${trigger.method}:${trigger.path}`
					if (this.routes.has(routeKey)) {
						throw new Error(
							`Duplicate route: ${trigger.method} ${trigger.path} ` +
								`(action: ${action.definition.config.name})`,
						)
					}
					const route: Route = {
						method: trigger.method,
						pattern: trigger.path,
						action,
						trigger,
					}
					this.routes.set(routeKey, route)
					// Also store in patterns array for path-param matching
					if (trigger.path.includes(':')) {
						this.routePatterns.push(route)
					}
				} else if (trigger.type === 'webhook') {
					const routeKey = `POST:${trigger.path}`
					if (this.routes.has(routeKey)) {
						throw new Error(
							`Duplicate route: POST ${trigger.path} ` +
								`(action: ${action.definition.config.name})`,
						)
					}
					const route: Route = {
						method: 'POST',
						pattern: trigger.path,
						action,
						trigger,
					}
					this.routes.set(routeKey, route)
					if (trigger.path.includes(':')) {
						this.routePatterns.push(route)
					}
				}
			}
		}
	}

	/**
	 * Refresh routes after registry changes (used for hot reload).
	 * Clears existing routes and rebuilds from updated registry.
	 */
	refreshRoutes(): void {
		// Clear existing routes
		this.routes.clear()
		this.routePatterns = []
		this.routeHandlers.clear()

		// Rebuild routes from updated registry
		this.buildRoutes()
		this.routeHandlers = this.buildOptimizedRoutes()

		this.logger.debug('Routes refreshed')
	}

	/**
	 * Build optimized route map with pre-compiled handlers.
	 * Instead of using Bun's routes API, we use a pre-compiled Map for O(1) lookups.
	 */
	private buildOptimizedRoutes(): Map<
		string,
		(req: Request) => Response | Promise<Response>
	> {
		const routeHandlers = new Map<
			string,
			(req: Request) => Response | Promise<Response>
		>()

		for (const action of this.registry.getAll()) {
			for (const trigger of action.triggers) {
				if (trigger.type === 'api' || trigger.type === 'webhook') {
					const method = trigger.type === 'webhook' ? 'POST' : trigger.method
					const path = trigger.path
					const routeKey = `${method}:${path}`

					// Check for duplicates
					if (routeHandlers.has(routeKey)) {
						throw new Error(
							`Duplicate route: ${method} ${path} (action: ${action.definition.config.name})`,
						)
					}

					// Create pre-compiled handler for this route
					routeHandlers.set(routeKey, this.createRouteHandler(action, trigger))

					this.logger.debug(`Registered route: ${routeKey}`)
				}
			}
		}

		return routeHandlers
	}

	/**
	 * Create a handler function for a specific route.
	 * This handler is called by Bun's native router.
	 */
	private createRouteHandler(
		action: RegisteredAction,
		trigger: ApiTriggerConfig | WebhookTriggerConfig,
	): (req: Request) => Promise<Response> {
		return async (req: Request): Promise<Response> => {
			const url = new URL(req.url)
			const method = req.method.toUpperCase()

			// Extract path parameters (Bun provides these in req.params)
			const params = (req as any).params || {}

			// Authenticate (if session manager is configured)
			let authContext: any = {}
			if (this.sessionManager) {
				const cookies = this.parseCookies(req.headers.get('Cookie'))
				const sessionToken = cookies[this.sessionManager.getCookieName()]
				if (sessionToken) {
					const payload = this.sessionManager.verifySession(sessionToken)
					if (payload) {
						authContext = payload
					}
				}
			}

			try {
				// Extract input from request
				let input: unknown

				if (trigger.type === 'api') {
					if (trigger.map) {
						input = await trigger.map(req)
					} else {
						// Use HTTP field mapping from schema metadata
						const inputSchema = action.definition.config.input
						if (
							inputSchema &&
							typeof inputSchema === 'object' &&
							'properties' in inputSchema
						) {
							input = await mapRequestToInput(
								req,
								url,
								inputSchema as any,
								params,
							)
						} else {
							// Fallback: Default mapping: POST/PUT/PATCH → body, GET/DELETE → query params
							if (['POST', 'PUT', 'PATCH'].includes(method)) {
								const contentType = req.headers.get('content-type') || ''

								if (contentType.includes('multipart/form-data')) {
									// Parse multipart form data (file uploads)
									const formData = await req.formData()
									input = {}

									for (const [key, value] of formData.entries()) {
										// FormDataEntryValue is string | File
										if (typeof value === 'string') {
											// Regular form field
											;(input as Record<string, unknown>)[key] = value
										} else {
											// value is File - convert to UploadedFile
											const file = value as File
											const arrayBuffer = await file.arrayBuffer()
											;(input as Record<string, unknown>)[key] = {
												filename: file.name,
												contentType: file.type,
												size: file.size,
												data: Buffer.from(arrayBuffer),
											}
										}
									}
								} else {
									// Parse JSON (default)
									input = await req.json().catch(() => ({}))
								}
							} else {
								input = Object.fromEntries(url.searchParams)
							}
							// Merge path parameters into input
							if (Object.keys(params).length > 0) {
								input = {
									...((input as Record<string, unknown>) ?? {}),
									...params,
								}
							}
						}
					}
				} else if (trigger.type === 'webhook') {
					// Webhooks: verify first, then map
					if (trigger.verify) {
						const valid = await trigger.verify(req)
						if (!valid) {
							return Response.json(
								{ error: 'Webhook verification failed' },
								{ status: 401 },
							)
						}
					}
					const body = await req.json().catch(() => ({}))
					input = trigger.map ? trigger.map(body) : body
				}

				// Response context
				const headers = new Headers()
				const setCookie = (name: string, value: string, opts?: any) => {
					let cookie = `${name}=${encodeURIComponent(value)}`
					if (opts?.path) cookie += `; Path=${opts.path}`
					if (opts?.httpOnly) cookie += '; HttpOnly'
					if (opts?.secure) cookie += '; Secure'
					if (opts?.sameSite) cookie += `; SameSite=${opts.sameSite}`
					if (opts?.expires) cookie += `; Expires=${opts.expires.toUTCString()}`
					if (opts?.maxAge) cookie += `; Max-Age=${opts.maxAge}`
					headers.append('Set-Cookie', cookie)
				}

				// Execute action
				const result = await executeAction(action, input, {
					triggerType: trigger.type,
					request: req,
					logger: this.logger,
					writeBuffer: this.writeBuffer,
					db: this.services?.db,
					storage: this.services?.storage,
					mailer: this.services?.mailer,
					kv: this.services?.kv,
					redis: this.services?.redis,
					channelManager: this.getChannelManager(),
					queue: this.queue,
					scheduler: this.scheduler,
					sessionManager: this.sessionManager,
					config: this.config,
					auth: authContext,
					response: { headers, setCookie },
					registry: this.registry,
				})

				// Apply session actions (set/clear cookies from ctx.auth)
				if (result.sessionActions && this.sessionManager) {
					// Use config value if provided, otherwise default to false for localhost dev
					const isSecure = this.config?.auth?.cookie?.secure ?? false

					for (const sa of result.sessionActions) {
						if (sa.type === 'create' && sa.token) {
							setCookie(this.sessionManager.getCookieName(), sa.token, {
								path: '/',
								httpOnly: true,
								secure: isSecure,
								sameSite: 'Lax',
							})
						} else if (sa.type === 'destroy') {
							setCookie(this.sessionManager.getCookieName(), '', {
								path: '/',
								httpOnly: true,
								secure: isSecure,
								sameSite: 'Lax',
								maxAge: 0,
							})
						}
					}
				}

				if (result.success) {
					// Apply HTTP transport metadata if present
					let status = 200
					if (result.transportMeta?.http) {
						const httpMeta = result.transportMeta.http

						// Apply custom status code
						if (httpMeta.status) {
							status = httpMeta.status
						}

						// Apply custom headers
						if (httpMeta.headers) {
							for (const [key, value] of Object.entries(httpMeta.headers)) {
								headers.set(key, value)
							}
						}

						// Apply cookies
						if (httpMeta.cookies) {
							for (const cookie of httpMeta.cookies) {
								let cookieStr = `${cookie.name}=${cookie.value}`
								if (cookie.httpOnly) cookieStr += '; HttpOnly'
								if (cookie.secure) cookieStr += '; Secure'
								if (cookie.sameSite) {
									// Capitalize first letter: 'strict' -> 'Strict'
									cookieStr += `; SameSite=${cookie.sameSite.charAt(0).toUpperCase()}${cookie.sameSite.slice(1)}`
								}
								if (cookie.path) cookieStr += `; Path=${cookie.path}`
								if (cookie.domain) cookieStr += `; Domain=${cookie.domain}`
								if (cookie.maxAge) cookieStr += `; Max-Age=${cookie.maxAge}`
								if (cookie.expires)
									cookieStr += `; Expires=${cookie.expires.toUTCString()}`
								headers.append('Set-Cookie', cookieStr)
							}
						}
					}

					// Apply HTTP output field mapping from schema
					const outputSchema = action.definition.config.output
					let responseBody: Record<string, unknown> = (result.data ||
						{}) as Record<string, unknown>

					if (
						outputSchema &&
						typeof outputSchema === 'object' &&
						'properties' in outputSchema
					) {
						const mapped = mapOutputToResponse(
							result.data as Record<string, any>,
							outputSchema as any,
						)

						// Apply mapped headers
						for (const [key, value] of Object.entries(mapped.headers)) {
							headers.set(key, value)
						}

						// Apply mapped cookies
						for (const cookie of mapped.cookies) {
							const cookieStr = serializeCookie(
								cookie.name,
								cookie.value,
								cookie.options,
							)
							headers.append('Set-Cookie', cookieStr)
						}

						// Use mapped body (excludes fields routed to headers/cookies)
						responseBody = mapped.body
					}

					return Response.json({ data: responseBody }, { status, headers })
				}

				// Error response
				const errorMessage = result.error ?? 'Unknown error'
				const errorObject = result.errorObject

				// Extract status code from error
				let status = 500
				if (errorObject instanceof GuardError) {
					status = errorObject.statusCode
				} else if (
					errorObject instanceof BunbaseError &&
					errorObject.statusCode
				) {
					status = errorObject.statusCode
				} else if (errorMessage.toLowerCase().includes('validation failed')) {
					status = 400
				}

				// Include error context in dev mode for debugging
				const isDev = process.env.NODE_ENV !== 'production'
				const errorResponse: Record<string, unknown> = {
					error: errorMessage,
				}

				// Always include trace ID for tracking
				if (errorObject instanceof BunbaseError && errorObject.context?.traceId) {
					errorResponse.traceId = errorObject.context.traceId
				}

				// In dev mode, include full context and stack
				if (isDev && errorObject instanceof BunbaseError) {
					if (errorObject.context) {
						errorResponse.context = errorObject.context
					}
					if (errorObject.stack) {
						errorResponse.stack = errorObject.stack
					}
				}

				return Response.json(errorResponse, { status, headers })
			} catch (err: unknown) {
				const errorMessage = err instanceof Error ? err.message : String(err)

				// Extract status code from error
				let status = 500
				if (err instanceof GuardError) {
					status = err.statusCode
				} else if (err instanceof BunbaseError && (err as any).statusCode) {
					status = (err as any).statusCode
				}

				// Include error context in dev mode for debugging
				const isDev = process.env.NODE_ENV !== 'production'
				const errorResponse: Record<string, unknown> = {
					error: errorMessage,
				}

				// Always include trace ID for tracking
				if (err instanceof BunbaseError && err.context?.traceId) {
					errorResponse.traceId = err.context.traceId
				}

				// In dev mode, include full context and stack
				if (isDev && err instanceof BunbaseError) {
					if (err.context) {
						errorResponse.context = err.context
					}
					if (err instanceof Error && err.stack) {
						errorResponse.stack = err.stack
					}
				}

				return Response.json(errorResponse, { status })
			}
		}
	}

	/**
	 * Match a URL pathname against a route pattern with path parameters.
	 * Returns params object if match, null otherwise.
	 */
	private matchPattern(
		pathname: string,
		pattern: string,
	): { params: Record<string, string> } | null {
		const patternParts = pattern.split('/')
		const pathParts = pathname.split('/')

		if (patternParts.length !== pathParts.length) {
			return null
		}

		const params: Record<string, string> = {}

		for (let i = 0; i < patternParts.length; i++) {
			const patternPart = patternParts[i]
			const pathPart = pathParts[i]

			if (!patternPart || !pathPart) {
				return null
			}

			if (patternPart.startsWith(':')) {
				// Path parameter
				params[patternPart.slice(1)] = pathPart
			} else if (patternPart !== pathPart) {
				// Static segment doesn't match
				return null
			}
		}

		return { params }
	}

	/**
	 * Main request handler with optimized routing.
	 */
	private async handleRequest(
		req: Request,
		server: Server<any>,
	): Promise<Response> {
		const startTime = performance.now()
		const url = new URL(req.url)
		const method = req.method.toUpperCase()
		const pathname = url.pathname
		let response: Response

		try {
			// Handle CORS preflight
			if (method === 'OPTIONS' && this.corsConfig) {
				response = this.handleCorsPreflightRequest(req)
				return response
			}

			// Handle WebSocket upgrade
			if (this.wsHandler) {
				if (this.wsHandler.isAtConnectionLimit(req)) {
					response = Response.json(
						{ error: 'Too many WebSocket connections' },
						{ status: 503 },
					)
					return response
				}
				if (this.wsHandler.tryUpgrade(req, server)) {
					// Upgrade was successful — Bun handles the rest
					return undefined as any
				}
			}

			// Try pre-compiled route handler first (O(1) lookup)
			const routeKey = `${method}:${pathname}`
			const handler = this.routeHandlers.get(routeKey)
			if (handler) {
				response = await handler(req)
				return this.addCorsHeaders(req, response)
			}

			// Try pattern matching for dynamic routes (e.g., /users/:id)
			for (const route of this.routePatterns) {
				if (route.method !== method) continue

				const match = this.matchPattern(pathname, route.pattern)
				if (match) {
					// Build route handler on-demand for this pattern
					const handler = this.createRouteHandler(route.action, route.trigger)
					// Store params on request object for extraction in createRouteHandler
					;(req as any).params = match.params
					response = await handler(req)
					return this.addCorsHeaders(req, response)
				}
			}

			// Check special routes (OpenAPI, Studio)
			if (this.openapiConfig?.enabled) {
				const specPath = this.openapiConfig.path ?? '/api/openapi.json'
				const docsPath = '/api/docs'

				if (pathname === specPath && method === 'GET') {
					const spec = generateOpenAPISpec(this.registry, {
						title: this.openapiConfig.title,
						version: this.openapiConfig.version,
					})
					response = Response.json(spec)
					return this.addCorsHeaders(req, response)
				}

				if (pathname === docsPath && method === 'GET') {
					const spec = generateOpenAPISpec(this.registry, {
						title: this.openapiConfig.title,
						version: this.openapiConfig.version,
					})
					const html = generateScalarDocs(spec)
					response = new Response(html, {
						headers: { 'Content-Type': 'text/html' },
					})
					return this.addCorsHeaders(req, response)
				}
			}

			// Bunbase schema endpoint (for React typegen)
			if (pathname === '/_bunbase/schema' && method === 'GET') {
				const schema = generateBunbaseSchema(this.registry)
				response = Response.json(schema)
				return this.addCorsHeaders(req, response)
			}

			// Studio dashboard UI
			if (this.studioConfig?.enabled) {
				const studioPath = this.studioConfig.path ?? '/_studio'
				if (pathname === studioPath || pathname === `${studioPath}/`) {
					response = new Response('Studio Dashboard - Coming Soon', {
						headers: { 'Content-Type': 'text/html' },
					})
					return this.addCorsHeaders(req, response)
				}
			}

			// Health check endpoints
			if (pathname === '/_health' && method === 'GET') {
				response = await this.handleHealthCheck('full')
				return this.addCorsHeaders(req, response)
			}
			if (pathname === '/_health/live' && method === 'GET') {
				response = await this.handleHealthCheck('live')
				return this.addCorsHeaders(req, response)
			}
			if (pathname === '/_health/ready' && method === 'GET') {
				response = await this.handleHealthCheck('ready')
				return this.addCorsHeaders(req, response)
			}

			// Metrics endpoint
			const metricsPath = this.observabilityConfig?.metrics?.path ?? '/_metrics'
			if (pathname === metricsPath && method === 'GET') {
				response = this.handleMetricsExport()
				return this.addCorsHeaders(req, response)
			}

			// Not found
			response = Response.json({ error: 'Not Found', path: pathname }, { status: 404 })
			return this.addCorsHeaders(req, response)
		} finally {
			// Record HTTP metrics (if enabled and response is set)
			if (this.metrics && response!) {
				const duration = performance.now() - startTime
				this.recordHttpMetrics(method, pathname, response.status, duration)
			}
		}
	}

	/**
	 * Start Bun HTTP server, scheduler, and optionally MCP server.
	 */
	start(opts?: {
		port?: number
		hostname?: string
		mcp?: boolean
	}): Server<any> {
		const { port = 3000, hostname = '0.0.0.0', mcp = false } = opts ?? {}

		this.buildRoutes()
		this.registerEventListeners()

		// Start scheduler if configured (handles cron-triggered actions)
		if (this.scheduler) {
			this.scheduler.start()
		}

		if (mcp) {
			this.mcp.start().catch((err) => {
				this.logger.error('Failed to start MCP server:', err)
			})
		}

		// Build optimized route handlers
		this.routeHandlers = this.buildOptimizedRoutes()

		// Start server with optimized fetch handler
		const serveOptions: any = {
			port,
			hostname,
			fetch: (req: Request, server: Server<any>) =>
				this.handleRequest(req, server),
			maxRequestBodySize: this.config?.maxRequestBodySize ?? 10485760, // 10MB default
		}

		// Add WebSocket handlers if realtime is enabled
		if (this.wsHandler) {
			serveOptions.websocket = this.wsHandler.getHandlers()
			if (this.realtimeConfig?.maxPayloadLength) {
				serveOptions.websocket.maxPayloadLength =
					this.realtimeConfig.maxPayloadLength
			}
			if (this.realtimeConfig?.idleTimeoutMs) {
				serveOptions.websocket.idleTimeout = Math.ceil(
					this.realtimeConfig.idleTimeoutMs / 1000,
				)
			}
		}

		this.server = Bun.serve(serveOptions)

		this.logger.info(`Server listening on ${hostname}:${port}`, {
			routes: this.routeHandlers.size,
			mcp,
			realtime: !!this.wsHandler,
		})

		if (this.wsHandler) {
			const wsPath = this.realtimeConfig?.path ?? '/ws'
			this.logger.info(
				`WebSocket realtime enabled at ws://${hostname}:${port}${wsPath}`,
			)
		}

		return this.server
	}

	/**
	 * Parse cookies using Bun's native CookieMap for better performance
	 */
	private parseCookies(cookieHeader: string | null): Record<string, string> {
		if (!cookieHeader) return {}
		const cookieMap = new CookieMap(cookieHeader)
		const cookies: Record<string, string> = {}
		for (const [key, value] of cookieMap) {
			cookies[key] = value
		}
		return cookies
	}

	/**
	 * Handle CORS preflight OPTIONS request
	 */
	private handleCorsPreflightRequest(req: Request): Response {
		const headers = this.buildCorsHeaders(req)
		return new Response(null, { status: 204, headers })
	}

	/**
	 * Add CORS headers to response
	 */
	private addCorsHeaders(req: Request, response: Response): Response {
		if (!this.corsConfig) return response

		const corsHeaders = this.buildCorsHeaders(req)
		const newHeaders = new Headers(response.headers)
		for (const [key, value] of Object.entries(corsHeaders)) {
			newHeaders.set(key, value)
		}

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		})
	}

	/**
	 * Build CORS headers based on configuration
	 */
	private buildCorsHeaders(req: Request): Record<string, string> {
		if (!this.corsConfig) return {}

		const headers: Record<string, string> = {}
		const origin = req.headers.get('origin')

		// Handle origin
		if (
			this.corsConfig.origin === true ||
			this.corsConfig.origin === undefined
		) {
			// Allow all origins
			headers['Access-Control-Allow-Origin'] = origin || '*'
		} else if (this.corsConfig.origin === false) {
			// Don't set CORS headers
			return {}
		} else if (typeof this.corsConfig.origin === 'string') {
			headers['Access-Control-Allow-Origin'] = this.corsConfig.origin
		} else if (Array.isArray(this.corsConfig.origin)) {
			// Check if origin is in allowed list
			if (origin && this.corsConfig.origin.includes(origin)) {
				headers['Access-Control-Allow-Origin'] = origin
			}
		}

		// Handle credentials
		if (this.corsConfig.credentials !== false) {
			headers['Access-Control-Allow-Credentials'] = 'true'
		}

		// Handle methods
		const methods = this.corsConfig.methods || [
			'GET',
			'POST',
			'PUT',
			'PATCH',
			'DELETE',
			'OPTIONS',
		]
		headers['Access-Control-Allow-Methods'] = methods.join(', ')

		// Handle headers
		const allowedHeaders = this.corsConfig.headers || [
			'Content-Type',
			'Authorization',
		]
		headers['Access-Control-Allow-Headers'] = allowedHeaders.join(', ')

		// Handle exposed headers
		if (this.corsConfig.exposedHeaders) {
			headers['Access-Control-Expose-Headers'] =
				this.corsConfig.exposedHeaders.join(', ')
		}

		// Handle max age
		const maxAge = this.corsConfig.maxAge ?? 86400
		headers['Access-Control-Max-Age'] = String(maxAge)

		return headers
	}

	/** Stop the server, scheduler, queue, MCP server, and WebSocket handler */
	async stop(): Promise<void> {
		this.server?.stop()
		this.mcp.stop()
		if (this.wsHandler) {
			this.wsHandler.close()
		}
		if (this.scheduler) {
			this.scheduler.stop()
		}
		if (this.queue) {
			await this.queue.stop()
		}
	}

	/**
	 * Register a module and its actions
	 */
	registerModule(mod: any): void {
		this.registry.registerModule(mod)
	}
}
