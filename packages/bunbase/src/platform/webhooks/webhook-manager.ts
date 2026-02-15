/**
 * Webhook Management
 * Register and manage webhook endpoints
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { OrgId, UserId } from '../core/types.ts'

export interface Webhook {
	id: string
	orgId?: OrgId
	userId?: UserId
	url: string
	events: string[]
	secret: string
	enabled: boolean
	createdAt: string
	updatedAt: string
}

export interface CreateWebhookData {
	orgId?: OrgId
	userId?: UserId
	url: string
	events: string[]
	secret: string
}

export interface UpdateWebhookData {
	url?: string
	events?: string[]
	enabled?: boolean
}

export interface ListWebhooksOptions {
	orgId?: OrgId
	userId?: UserId
	enabled?: boolean
	limit?: number
	offset?: number
}

/**
 * Manages webhook registrations
 */
export class WebhookManager {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
	) {}

	/**
	 * Register a new webhook
	 * - Either orgId or userId must be provided
	 * - URL must be HTTPS in production
	 * - Secret used for HMAC signature verification
	 */
	async create(data: CreateWebhookData): Promise<Webhook> {
		if (!data.orgId && !data.userId) {
			throw new Error('Either orgId or userId must be provided')
		}

		this.logger.info('Creating webhook', { url: data.url, events: data.events })

		try {
			const rows = await this.sql`
				INSERT INTO webhooks (
					org_id,
					user_id,
					url,
					events,
					secret,
					enabled,
					created_at,
					updated_at
				)
				VALUES (
					${data.orgId || null},
					${data.userId || null},
					${data.url},
					${JSON.stringify(data.events)},
					${data.secret},
					true,
					NOW(),
					NOW()
				)
				RETURNING
					id,
					org_id as "orgId",
					user_id as "userId",
					url,
					events,
					secret,
					enabled,
					created_at as "createdAt",
					updated_at as "updatedAt"
			`

			const webhook = rows[0] as Webhook

			this.logger.info('Webhook created', { id: webhook.id })

			return webhook
		} catch (err) {
			this.logger.error('Failed to create webhook', { error: err })
			throw err
		}
	}

	/**
	 * Get webhook by ID
	 */
	async get(webhookId: string): Promise<Webhook | null> {
		const rows = await this.sql`
			SELECT
				id,
				org_id as "orgId",
				user_id as "userId",
				url,
				events,
				secret,
				enabled,
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM webhooks
			WHERE id = ${webhookId}
		`

		if (rows.length === 0) return null

		return rows[0] as Webhook
	}

	/**
	 * Update webhook
	 */
	async update(webhookId: string, data: UpdateWebhookData): Promise<Webhook> {
		const webhook = await this.get(webhookId)
		if (!webhook) throw new Error('Webhook not found')

		const updates: string[] = []
		const values: unknown[] = []

		if (data.url !== undefined) {
			updates.push(`url = $${updates.length + 1}`)
			values.push(data.url)
		}

		if (data.events !== undefined) {
			updates.push(`events = $${updates.length + 1}`)
			values.push(JSON.stringify(data.events))
		}

		if (data.enabled !== undefined) {
			updates.push(`enabled = $${updates.length + 1}`)
			values.push(data.enabled)
		}

		if (updates.length === 0) {
			// No updates needed
			return webhook
		}

		updates.push('updated_at = NOW()')
		values.push(webhookId)

		const sql = `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`

		const rows = await this.sql.unsafe(sql, values)

		this.logger.info('Webhook updated', { webhookId, updates: Object.keys(data) })

		const updated = rows[0] as {
			id: string
			org_id?: string
			user_id?: string
			url: string
			events: string
			secret: string
			enabled: boolean
			created_at: string
			updated_at: string
		}

		return {
			id: updated.id,
			orgId: updated.org_id as OrgId | undefined,
			userId: updated.user_id as UserId | undefined,
			url: updated.url,
			events: JSON.parse(updated.events),
			secret: updated.secret,
			enabled: updated.enabled,
			createdAt: updated.created_at,
			updatedAt: updated.updated_at,
		}
	}

	/**
	 * Delete webhook
	 */
	async delete(webhookId: string): Promise<void> {
		await this.sql`DELETE FROM webhooks WHERE id = ${webhookId}`

		this.logger.info('Webhook deleted', { webhookId })
	}

	/**
	 * List webhooks
	 */
	async list(options: ListWebhooksOptions = {}): Promise<Webhook[]> {
		const limit = options.limit || 50
		const offset = options.offset || 0

		let query = this.sql`
			SELECT
				id,
				org_id as "orgId",
				user_id as "userId",
				url,
				events,
				secret,
				enabled,
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM webhooks
			WHERE 1=1
		`

		if (options.orgId) {
			query = this.sql`${query} AND org_id = ${options.orgId}`
		}

		if (options.userId) {
			query = this.sql`${query} AND user_id = ${options.userId}`
		}

		if (options.enabled !== undefined) {
			query = this.sql`${query} AND enabled = ${options.enabled}`
		}

		const rows = await this.sql`
			${query}
			ORDER BY created_at DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`

		return rows.map((row: Record<string, unknown>) => {
			const r = row as {
				id: string
				orgId?: string
				userId?: string
				url: string
				events: string
				secret: string
				enabled: boolean
				createdAt: string
				updatedAt: string
			}

			return {
				...r,
				events: JSON.parse(r.events),
			}
		})
	}

	/**
	 * Get webhooks subscribed to a specific event
	 */
	async getForEvent(eventName: string, orgId?: OrgId, userId?: UserId): Promise<Webhook[]> {
		let query = this.sql`
			SELECT
				id,
				org_id as "orgId",
				user_id as "userId",
				url,
				events,
				secret,
				enabled,
				created_at as "createdAt",
				updated_at as "updatedAt"
			FROM webhooks
			WHERE enabled = true
			  AND events @> ${JSON.stringify([eventName])}
		`

		if (orgId) {
			query = this.sql`${query} AND org_id = ${orgId}`
		}

		if (userId) {
			query = this.sql`${query} AND user_id = ${userId}`
		}

		const rows = await query

		return rows.map((row: Record<string, unknown>) => {
			const r = row as {
				id: string
				orgId?: string
				userId?: string
				url: string
				events: string
				secret: string
				enabled: boolean
				createdAt: string
				updatedAt: string
			}

			return {
				...r,
				events: JSON.parse(r.events),
			}
		})
	}

	/**
	 * Enable webhook
	 */
	async enable(webhookId: string): Promise<void> {
		await this.update(webhookId, { enabled: true })
	}

	/**
	 * Disable webhook
	 */
	async disable(webhookId: string): Promise<void> {
		await this.update(webhookId, { enabled: false })
	}
}
