import type { Server } from 'bun'
import { type SessionConfig, SessionManager } from '../auth/session.ts'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ApiTriggerConfig, WebhookTriggerConfig } from '../core/types.ts'
import { parsePathParams, matchViewPath } from '../core/url-parser.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { eventBus } from './event-bus.ts'
import { executeAction } from './executor.ts'
import { McpService } from './mcp-server.ts'
import type { Queue } from './queue.ts'
import { Scheduler } from './scheduler.ts'
import { generateOpenAPISpec, generateScalarDocs } from '../openapi/generator.ts'
import type { BunbaseConfig } from '../config/types.ts'
import { studioModule } from '../studio/module.ts'
import { BunbaseError } from '../utils/errors.ts'
import { GuardError } from '../guards/types.ts'

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
	private server: Server<any> | null = null
	private scheduler?: Scheduler
	private queue?: Queue
	private mcp: McpService
	private sessionManager?: SessionManager
	private openapiConfig?: BunbaseConfig['openapi']
	private studioConfig?: BunbaseConfig['studio']

	constructor(
		private readonly registry: ActionRegistry,
		private readonly logger: Logger,
		private readonly writeBuffer: WriteBuffer,
		config?: BunbaseConfig,
	) {
		this.mcp = new McpService(registry, logger, writeBuffer)
		this.openapiConfig = config?.openapi
		this.studioConfig = config?.studio
		if (config?.auth) {
			this.sessionManager = new SessionManager({
				secret: config.auth.sessionSecret,
				cookieName: config.auth.cookieName,
				expiresIn: config.auth.expiresIn,
			})
		}

		// Register studio actions if studio is enabled
		if (this.studioConfig?.enabled) {
			this.registry.registerModule(studioModule)
		}
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
	registerJob(name: string, handler: (data: unknown, ctx: any) => Promise<void>): void {
		this.queue?.register(name, handler)
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
							await executeAction(action, input, {
								triggerType: 'event',
								logger: this.logger,
								writeBuffer: this.writeBuffer,
								registry: this.registry,
							})
						} catch (err: any) {
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
					const route: Route = { method: trigger.method, pattern: trigger.path, action, trigger }
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
	 * Find a route matching the given method and pathname.
	 * First tries exact match, then falls back to pattern matching for path params.
	 */
	private findRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
		// 1. Try exact match
		const routeKey = `${method}:${pathname}`
		const exactRoute = this.routes.get(routeKey)
		if (exactRoute) {
			return { route: exactRoute, params: {} }
		}

		// 2. Try pattern matching for routes with path parameters
		for (const route of this.routePatterns) {
			if (route.method !== method) continue
			if (matchViewPath(pathname, route.pattern)) {
				const params = parsePathParams(pathname, route.pattern)
				return { route, params: params as Record<string, string> }
			}
		}

		return null
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

		// Debug: Log all routes
		for (const routeKey of this.routes.keys()) {
			this.logger.debug(`Registered route: ${routeKey}`)
		}

		if (mcp) {
			this.mcp.start().catch((err) => {
				this.logger.error('Failed to start MCP server:', err)
			})
		}

		this.server = Bun.serve({
			port,
			hostname,
			fetch: (req) => this.handleRequest(req),
		})

		this.logger.info(`Server listening on ${hostname}:${port}`, {
			routes: this.routes.size,
			mcp,
		})

		return this.server
	}

	/**
	 * Parsing cookies manually since we want to avoid external deps and Bun req.headers is standard.
	 */
	private parseCookies(cookieHeader: string | null): Record<string, string> {
		if (!cookieHeader) return {}
		return cookieHeader.split(';').reduce(
			(acc, cookie) => {
				const [key, value] = cookie.split('=').map((c) => c.trim())
				if (key && value) {
					acc[key] = decodeURIComponent(value)
				}
				return acc
			},
			{} as Record<string, string>,
		)
	}

	/**
	 * Handle incoming HTTP requests.
	 */
	private async handleRequest(req: Request): Promise<Response> {
		const url = new URL(req.url)
		const method = req.method.toUpperCase()
		const pathname = url.pathname

		// OpenAPI spec endpoint
		if (this.openapiConfig?.enabled) {
			const specPath = this.openapiConfig.path ?? '/api/openapi.json'
			const docsPath = '/api/docs'

			if (pathname === specPath && method === 'GET') {
				const spec = generateOpenAPISpec(this.registry, {
					title: this.openapiConfig.title,
					version: this.openapiConfig.version,
				})
				return Response.json(spec)
			}

			if (pathname === docsPath && method === 'GET') {
				const spec = generateOpenAPISpec(this.registry, {
					title: this.openapiConfig.title,
					version: this.openapiConfig.version,
				})
				const html = generateScalarDocs(spec)
				return new Response(html, {
					headers: { 'Content-Type': 'text/html' },
				})
			}
		}

		// Studio dashboard UI
		if (this.studioConfig?.enabled) {
			const studioPath = this.studioConfig.path ?? '/_studio'
			if (pathname === studioPath || pathname === `${studioPath}/`) {
				return new Response('Studio Dashboard - Coming Soon', {
					headers: { 'Content-Type': 'text/html' },
				})
			}
		}

		// Find matching route (exact or pattern match)
		const match = this.findRoute(method, pathname)

		this.logger.debug(`[Request] ${method} ${pathname} -> ${match ? 'ACTION' : 'MISS'}`)

		if (!match) {
			return Response.json(
				{ error: 'Not Found', path: pathname },
				{ status: 404 },
			)
		}

		const { route, params } = match

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

			if (route.trigger.type === 'api') {
				if (route.trigger.map) {
					input = await route.trigger.map(req)
				} else {
					// Default mapping: POST/PUT/PATCH → body, GET/DELETE → query params
					if (['POST', 'PUT', 'PATCH'].includes(method)) {
						input = await req.json().catch(() => ({}))
					} else {
						input = Object.fromEntries(url.searchParams)
					}
				}
				// Merge path parameters into input
				if (Object.keys(params).length > 0) {
					input = { ...(input as Record<string, unknown> ?? {}), ...params }
				}
			} else if (route.trigger.type === 'webhook') {
				// Webhooks: verify first, then map
				if (route.trigger.verify) {
					const valid = await route.trigger.verify(req)
					if (!valid) {
						return Response.json(
							{ error: 'Webhook verification failed' },
							{ status: 401 },
						)
					}
				}
				const body = await req.json().catch(() => ({}))
				input = route.trigger.map ? route.trigger.map(body) : body
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
			const result = await executeAction(route.action, input, {
				triggerType: route.trigger.type,
				request: req,
				logger: this.logger,
				writeBuffer: this.writeBuffer,
				queue: this.queue,
				scheduler: this.scheduler,
				auth: authContext,
				response: { headers, setCookie },
				registry: this.registry,
			})

			if (result.success) {
				return Response.json({ data: result.data }, { headers })
			}

			// Determine error status from the error object
			let status = 500
			if (result.errorObject instanceof GuardError) {
				status = result.errorObject.statusCode
			} else if (result.errorObject instanceof BunbaseError) {
				status = result.errorObject.statusCode
			} else if (result.error?.includes('validation failed')) {
				status = 400
			}

			return Response.json({ error: result.error }, { status, headers })
		} catch (err: any) {
			// Handle BunbaseError instances with their specific status codes
			if (err instanceof BunbaseError) {
				this.logger.error(`Action error: ${err.message}`)
				return Response.json({ error: err.message }, { status: err.statusCode })
			}

			// Handle other errors as internal server errors
			const message = err instanceof Error ? err.message : 'Internal server error'
			this.logger.error(`Unhandled error: ${message}`)
			return Response.json({ error: message }, { status: 500 })
		}
	}

	/** Stop the server, scheduler, queue, and MCP server */
	async stop(): Promise<void> {
		this.server?.stop()
		this.mcp.stop()
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
