import type { Server } from 'bun'
import { type SessionConfig, SessionManager } from '../auth/session.ts'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ApiTriggerConfig, WebhookTriggerConfig } from '../core/types.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { eventBus } from './event-bus.ts'
import { executeAction } from './executor.ts'
import { McpService } from './mcp-server.ts'
import { Scheduler } from './scheduler.ts'

interface Route {
    method: string
    action: RegisteredAction
    trigger: ApiTriggerConfig | WebhookTriggerConfig
}

export interface BunbaseServerConfig {
    auth?: SessionConfig
}

/**
 * Bun HTTP server with route registration from action triggers.
 */
export class BunbaseServer {
    private routes = new Map<string, Route>()
    private server: Server<any> | null = null
    private scheduler: Scheduler
    private mcp: McpService
    private sessionManager?: SessionManager

    constructor(
        private readonly registry: ActionRegistry,
        private readonly logger: Logger,
        private readonly writeBuffer: WriteBuffer,
        config?: BunbaseServerConfig,
    ) {
        this.scheduler = new Scheduler(registry, logger, writeBuffer)
        this.mcp = new McpService(registry, logger, writeBuffer)
        if (config?.auth) {
            this.sessionManager = new SessionManager(config.auth)
        }
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
        this.scheduler.start()

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

        // Find matching route
        const routeKey = `${method}:${pathname}`
        const route = this.routes.get(routeKey)

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

    /** Stop the server, scheduler, and MCP server */
    stop(): void {
        this.server?.stop()
        this.scheduler.stop()
        this.mcp.stop()
    }

    /** Get registered route count */
    get routeCount(): number {
        return this.routes.size
    }
}
