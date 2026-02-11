import type {
	ApiTriggerConfig,
	CronTriggerConfig,
	EventTriggerConfig,
	HttpMethod,
	ToolTriggerConfig,
	WebhookTriggerConfig,
} from '../types.ts'

/**
 * Trigger builders — declarative bindings that connect actions to entry points.
 */
export const triggers = {
	/**
	 * HTTP API trigger — registers a route on the Bun HTTP server.
	 *
	 * @example triggers.api('POST', '/users')
	 * @example triggers.api('GET', '/users/:id', { map: (req) => ({ id: req.params.id }) })
	 */
	api(
		method: HttpMethod,
		path: string,
		opts?: { map?: (req: Request) => unknown | Promise<unknown> },
	): ApiTriggerConfig {
		return { type: 'api', method, path, map: opts?.map }
	},

	/**
	 * Event bus trigger — subscribes to internal event bus.
	 *
	 * @example triggers.event('user.created')
	 */
	event(
		event: string,
		opts?: { map?: (payload: unknown) => unknown },
	): EventTriggerConfig {
		return { type: 'event', event, map: opts?.map }
	},

	/**
	 * Cron trigger — runs on a cron schedule.
	 *
	 * @example triggers.cron('0 2 * * *')
	 */
	cron(schedule: string, opts?: { input?: () => unknown }): CronTriggerConfig {
		return { type: 'cron', schedule, input: opts?.input }
	},

	/**
	 * MCP tool trigger — exposes the action as an MCP tool for LLM agents.
	 *
	 * @example triggers.tool({ name: 'create_user', description: 'Create a user' })
	 */
	tool(opts: { name: string; description: string }): ToolTriggerConfig {
		return { type: 'tool', name: opts.name, description: opts.description }
	},

	/**
	 * Webhook trigger — incoming webhook endpoint with optional signature verification.
	 *
	 * @example triggers.webhook('/webhooks/stripe', { verify: verifyStripe, map: extractData })
	 */
	webhook(
		path: string,
		opts?: {
			verify?: (req: Request) => boolean | Promise<boolean>
			map?: (body: unknown) => unknown
		},
	): WebhookTriggerConfig {
		return {
			type: 'webhook',
			path,
			verify: opts?.verify,
			map: opts?.map,
		}
	},
}
