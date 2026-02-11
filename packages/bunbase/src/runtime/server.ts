import type { Server } from 'bun'
import { type SessionConfig, SessionManager } from '../auth/session.ts'
import type { BunbaseConfig } from '../config/types.ts'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ApiTriggerConfig, WebhookTriggerConfig } from '../core/types.ts'
import type { Logger } from '../logger/index.ts'
import {
	generateOpenAPISpec,
	generateScalarDocs,
} from '../openapi/generator.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import {
	matchViewPath,
	parsePathParams,
	parseQueryParams,
} from '../views/url-parser.ts'
import { html, renderJSX } from '../views/view.ts'
import { ViewRegistry } from '../views/view-registry.ts'
import { eventBus } from './event-bus.ts'
import { executeAction } from './executor.ts'
import { McpService } from './mcp-server.ts'
import type { Queue } from './queue.ts'
import type { Scheduler } from './scheduler.ts'

interface Route {
	method: string
	action: RegisteredAction
	trigger: ApiTriggerConfig | WebhookTriggerConfig
}

export interface BunbaseServerConfig {
	auth?: SessionConfig
	openapi?: {
		enabled: boolean
		path?: string
		title?: string
		version?: string
	}
}

/**
 * Bun HTTP server with route registration from action triggers.
 */
export class BunbaseServer {
	private routes = new Map<string, Route>()
	private server: Server<any> | null = null
	private scheduler?: Scheduler
	private queue?: Queue
	private mcp: McpService
	private sessionManager?: SessionManager
	private openapiConfig?: BunbaseServerConfig['openapi']
	private viewsConfig?: BunbaseConfig['views']
	private viewRegistry = new ViewRegistry()

	constructor(
		private readonly registry: ActionRegistry,
		private readonly logger: Logger,
		private readonly writeBuffer: WriteBuffer,
		config?: BunbaseConfig,
	) {
		this.mcp = new McpService(registry, logger, writeBuffer)
		this.openapiConfig = config?.openapi
		this.viewsConfig = config?.views
		if (config?.auth) {
			this.sessionManager = new SessionManager({
				secret: config.auth.sessionSecret,
				cookieName: config.auth.cookieName,
				expiresIn: config.auth.expiresIn,
			})
		}

		// Auto-mount OpenAPI routes if enabled
		if (this.openapiConfig?.enabled) {
			this.mountOpenAPI()
		}
	}

	private mountOpenAPI(): void {
		const specPath = this.openapiConfig?.path ?? '/api/openapi.json'
		const docsPath = '/api/docs'

		// Store original handleRequest reference
		const originalHandleRequest = this.handleRequest.bind(this)

		// Override handleRequest to intercept OpenAPI routes
		this.handleRequest = async (req: Request): Promise<Response> => {
			const url = new URL(req.url)
			const method = req.method.toUpperCase()

			// OpenAPI spec endpoint
			if (url.pathname === specPath && method === 'GET') {
				const spec = generateOpenAPISpec(this.registry, {
					title: this.openapiConfig?.title,
					version: this.openapiConfig?.version,
				})
				return Response.json(spec)
			}

			// Scalar docs UI
			if (url.pathname === docsPath && method === 'GET') {
				const spec = generateOpenAPISpec(this.registry, {
					title: this.openapiConfig?.title,
					version: this.openapiConfig?.version,
				})
				const html = generateScalarDocs(spec)
				return new Response(html, {
					headers: { 'Content-Type': 'text/html' },
				})
			}

			return originalHandleRequest(req)
		}

		this.logger.info(`[OpenAPI] Mounted at ${specPath} and ${docsPath}`)
	}

	/**
	 * Register the scheduler for cron-triggered actions.
	 */
	setScheduler(scheduler: Scheduler): void {
		this.scheduler = scheduler
	}

	/**
	 * Register the queue for background job processing.
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
							})
						} catch (err) {
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
					this.routes.set(routeKey, { method: trigger.method, action, trigger })
				} else if (trigger.type === 'webhook') {
					const routeKey = `POST:${trigger.path}`
					this.routes.set(routeKey, {
						method: 'POST',
						action,
						trigger,
					})
				}
			}
		}
	}

	/**
	 * Start the Bun HTTP server, scheduler, and optionally MCP server.
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
		for (const headers of this.routes.keys()) {
			this.logger.debug(`Registered route: ${headers}`)
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
		if (pathname === '/api/openapi.json' && method === 'GET') {
			const spec = generateOpenAPISpec(this.registry, { title: 'Bunbase API' })
			return Response.json(spec)
		}

		// Scalar API docs UI
		if (pathname === '/api/docs' && method === 'GET') {
			const spec = generateOpenAPISpec(this.registry, { title: 'Bunbase API' })
			const html = generateScalarDocs(spec)
			return new Response(html, {
				headers: { 'Content-Type': 'text/html' },
			})
		}

		// Check for view routes (only GET requests)
		if (method === 'GET') {
			const view = this.viewRegistry.findByPath(pathname)
			if (view) {
				return this.handleView(view, req)
			}
		}

		const routeKey = `${method}:${pathname}`
		const route = this.routes.get(routeKey)

		this.logger.debug(
			`[Request] ${method} ${pathname} -> ${route ? 'ACTION' : 'MISS'}`,
		)

		if (!route) {
			return Response.json(
				{ error: 'Not Found', path: pathname },
				{ status: 404 },
			)
		}

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

			// Execute the action
			const result = await executeAction(route.action, input, {
				triggerType: route.trigger.type,
				request: req,
				logger: this.logger,
				writeBuffer: this.writeBuffer,
				queue: this.queue,
				scheduler: this.scheduler,
				auth: authContext,
				response: { headers, setCookie },
			})

			if (result.success) {
				return Response.json({ data: result.data }, { headers })
			}

			// Determine error status
			// Map GuardError (403/401) to Status Code
			let status = 500
			if (result.error?.includes('validation failed')) status = 400
			else if (result.error?.includes('Unauthorized')) status = 401
			else if (result.error?.includes('Forbidden')) status = 403
			else if (result.error?.includes('Too Many Requests')) status = 429

			return Response.json({ error: result.error }, { status, headers })
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Internal server error'
			this.logger.error(`Unhandled error: ${message}`)
			return Response.json({ error: message }, { status: 500 })
		}
	}

	/**
	 * Handle view requests with parameter parsing and guard execution
	 */
	private async handleView(view: any, req: Request): Promise<Response> {
		const url = new URL(req.url)
		const pathname = url.pathname

		try {
			// Parse URL parameters and query strings
			const params = parsePathParams(pathname, view.path, view.paramsSchema)
			const query = parseQueryParams(url, view.querySchema)

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

			// Create action context for guards and render function
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

			const ctx: any = {
				db: null, // TODO: inject database client
				logger: this.logger,
				traceId: crypto.randomUUID(),
				event: { emit: () => {} },
				auth: authContext,
				response: { headers, setCookie },
				request: req,
				headers: Object.fromEntries(req.headers.entries()),
				schedule: () => Promise.resolve(''),
				queue: {
					add: () => Promise.resolve(''),
					push: () => Promise.resolve(''),
					get: () => Promise.resolve(null),
					getAll: () => Promise.resolve([]),
					update: () => Promise.resolve(false),
					delete: () => Promise.resolve(false),
					remove: () => Promise.resolve(false),
				},
			}

			// Run guards if any
			if (view.guards) {
				for (const guard of view.guards) {
					await guard(ctx)
				}
			}

			// Render the view
			const jsx = await view.render({ params, query }, ctx)
			const content = renderJSX(jsx)
			const fullHtml = html(`${view.name} - Bunbase`, content, this.viewsConfig)

			return new Response(fullHtml, {
				headers: {
					'Content-Type': 'text/html',
					...Object.fromEntries(headers.entries()),
				},
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : 'View render error'
			this.logger.error(`View error for ${view.name}: ${message}`)
			return new Response(
				html(
					'Error',
					`<div class="p-6 text-red-600">Error: ${message}</div>`,
					this.viewsConfig,
				),
				{
					status: 500,
					headers: { 'Content-Type': 'text/html' },
				},
			)
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
	 * Register a view for server-side rendering
	 */
	registerView(view: any): void {
		this.viewRegistry.register(view)
	}

	/**
	 * Register a module and its views/actions
	 */
	registerModule(mod: any): void {
		// Register actions
		this.registry.registerModule(mod)
		// Register views
		if (mod.config.views) {
			this.viewRegistry.registerModule(mod)
		}
	}
}
