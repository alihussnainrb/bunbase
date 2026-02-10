import type { Server } from 'bun'
import type { ActionRegistry, RegisteredAction } from '../core/registry.ts'
import type { ApiTriggerConfig, WebhookTriggerConfig } from '../core/types.ts'
import type { Logger } from '../logger/index.ts'
import type { WriteBuffer } from '../persistence/write-buffer.ts'
import { executeAction } from './executor.ts'

interface Route {
    method: string
    action: RegisteredAction
    trigger: ApiTriggerConfig | WebhookTriggerConfig
}

/**
 * Bun HTTP server with route registration from action triggers.
 */
export class BunbaseServer {
    private routes = new Map<string, Route>()
    private server: Server<any> | null = null

    constructor(
        private readonly registry: ActionRegistry,
        private readonly logger: Logger,
        private readonly writeBuffer: WriteBuffer,
    ) { }

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
     * Start the Bun HTTP server.
     */
    start(port: number = 3000, hostname: string = '0.0.0.0'): Server<any> {
        this.buildRoutes()


        this.server = Bun.serve({
            port,
            hostname,
            fetch: (req) => this.handleRequest(req),
        })

        this.logger.info(`Server listening on ${hostname}:${port}`, {
            routes: this.routes.size,
        })

        return this.server
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

            // Execute the action
            const result = await executeAction(route.action, input, {
                triggerType: route.trigger.type,
                request: req,
                logger: this.logger,
                writeBuffer: this.writeBuffer,
            })

            if (result.success) {
                return Response.json({ data: result.data })
            }

            // Determine error status
            const status = result.error?.includes('validation failed') ? 400 : 500
            return Response.json({ error: result.error }, { status })
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Internal server error'
            this.logger.error(`Unhandled error: ${message}`)
            return Response.json({ error: message }, { status: 500 })
        }
    }

    /** Stop the server */
    stop(): void {
        this.server?.stop()
    }

    /** Get registered route count */
    get routeCount(): number {
        return this.routes.size
    }
}
