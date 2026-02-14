/**
 * Webhook Dispatcher
 * Delivers webhook events with retry logic and HMAC signatures
 */

import type { SQL } from 'bun'
import type { Logger } from '../../logger/index.ts'
import type { WebhookEvent, WebhookEventStatus } from '../core/types.ts'
import type { Webhook } from './webhook-manager.ts'

export interface DispatchEventData {
	eventName: string
	payload: Record<string, unknown>
	orgId?: string
	userId?: string
}

export interface WebhookDelivery {
	eventId: string
	webhookId: string
	url: string
	attempt: number
	status: WebhookEventStatus
	responseCode?: number
	responseBody?: string
	error?: string
	deliveredAt?: string
}

/**
 * Dispatches webhook events with retry logic
 */
export class WebhookDispatcher {
	constructor(
		private readonly sql: SQL,
		private readonly logger: Logger,
		private readonly maxAttempts = 5,
	) {}

	/**
	 * Dispatch an event to all subscribed webhooks
	 * - Finds webhooks subscribed to this event
	 * - Queues delivery for each webhook
	 * - Returns list of event IDs
	 */
	async dispatch(data: DispatchEventData): Promise<string[]> {
		const { eventName, payload, orgId, userId } = data

		this.logger.info('Dispatching webhook event', { eventName, orgId, userId })

		// Find subscribed webhooks
		const webhooks = await this.findWebhooks(eventName, orgId, userId)

		if (webhooks.length === 0) {
			this.logger.debug('No webhooks subscribed to event', { eventName })
			return []
		}

		const eventIds: string[] = []

		// Create event records
		for (const webhook of webhooks) {
			const eventId = await this.createEvent({
				webhookId: webhook.id,
				eventName,
				payload,
				orgId,
				userId,
			})

			eventIds.push(eventId)

			// Attempt immediate delivery (async)
			this.deliverEvent(eventId, webhook).catch((err) => {
				this.logger.error('Failed to deliver webhook event', {
					eventId,
					webhookId: webhook.id,
					error: err,
				})
			})
		}

		return eventIds
	}

	/**
	 * Deliver a webhook event
	 * - Signs payload with HMAC
	 * - Sends HTTP POST request
	 * - Handles retries with exponential backoff
	 */
	async deliverEvent(eventId: string, webhook: Webhook): Promise<WebhookDelivery> {
		const event = await this.getEvent(eventId)
		if (!event) throw new Error('Event not found')

		const attempt = event.attempts + 1

		this.logger.debug('Delivering webhook event', {
			eventId,
			webhookId: webhook.id,
			attempt,
		})

		try {
			// Sign payload
			const signature = await this.signPayload(event.payload, webhook.secret)

			// Send request
			const response = await fetch(webhook.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Webhook-Signature': signature,
					'X-Webhook-Event': event.eventName,
					'X-Webhook-Event-ID': eventId,
				},
				body: JSON.stringify(event.payload),
			})

			const responseBody = await response.text()

			// Update event record
			await this.updateEvent(eventId, {
				status: response.ok ? 'delivered' : 'failed',
				attempts: attempt,
				responseCode: response.status,
				responseBody: responseBody.slice(0, 1000), // Limit to 1000 chars
				lastAttemptAt: new Date().toISOString(),
				deliveredAt: response.ok ? new Date().toISOString() : undefined,
			})

			if (!response.ok) {
				throw new Error(`Webhook returned ${response.status}: ${responseBody}`)
			}

			this.logger.info('Webhook event delivered', { eventId, webhookId: webhook.id })

			return {
				eventId,
				webhookId: webhook.id,
				url: webhook.url,
				attempt,
				status: 'delivered',
				responseCode: response.status,
				responseBody,
				deliveredAt: new Date().toISOString(),
			}
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err)

			this.logger.error('Webhook delivery failed', { eventId, webhookId: webhook.id, error })

			// Update event record
			const status = attempt >= this.maxAttempts ? 'failed' : 'pending'

			await this.updateEvent(eventId, {
				status,
				attempts: attempt,
				error: error.slice(0, 1000), // Limit to 1000 chars
				lastAttemptAt: new Date().toISOString(),
			})

			// Schedule retry if not max attempts
			if (attempt < this.maxAttempts) {
				const delay = this.calculateBackoff(attempt)
				this.logger.info('Scheduling webhook retry', {
					eventId,
					attempt,
					delay,
				})

				// Queue retry (in production, use a job queue)
				setTimeout(() => {
					this.deliverEvent(eventId, webhook).catch((retryErr) => {
						this.logger.error('Webhook retry failed', {
							eventId,
							error: retryErr,
						})
					})
				}, delay)
			}

			return {
				eventId,
				webhookId: webhook.id,
				url: webhook.url,
				attempt,
				status,
				error,
			}
		}
	}

	/**
	 * Calculate exponential backoff delay
	 * - Attempt 1: 1 minute
	 * - Attempt 2: 5 minutes
	 * - Attempt 3: 15 minutes
	 * - Attempt 4: 30 minutes
	 * - Attempt 5: 1 hour
	 */
	private calculateBackoff(attempt: number): number {
		const delays = [
			1 * 60 * 1000, // 1 minute
			5 * 60 * 1000, // 5 minutes
			15 * 60 * 1000, // 15 minutes
			30 * 60 * 1000, // 30 minutes
			60 * 60 * 1000, // 1 hour
		]

		return delays[attempt - 1] || delays[delays.length - 1]
	}

	/**
	 * Sign payload with HMAC-SHA256
	 */
	private async signPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
		const data = JSON.stringify(payload)
		const encoder = new TextEncoder()
		const keyData = encoder.encode(secret)
		const messageData = encoder.encode(data)

		const key = await crypto.subtle.importKey(
			'raw',
			keyData,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign'],
		)

		const signature = await crypto.subtle.sign('HMAC', key, messageData)

		return Array.from(new Uint8Array(signature))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	}

	/**
	 * Find webhooks subscribed to event
	 */
	private async findWebhooks(
		eventName: string,
		orgId?: string,
		userId?: string,
	): Promise<Webhook[]> {
		let query = this.sql`
			SELECT
				id,
				org_id as "orgId",
				user_id as "userId",
				url,
				events,
				secret,
				enabled
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

		return rows.map((row) => {
			const r = row as {
				id: string
				orgId?: string
				userId?: string
				url: string
				events: string
				secret: string
				enabled: boolean
			}

			return {
				...r,
				events: JSON.parse(r.events),
				createdAt: '',
				updatedAt: '',
			}
		})
	}

	/**
	 * Create webhook event record
	 */
	private async createEvent(data: {
		webhookId: string
		eventName: string
		payload: Record<string, unknown>
		orgId?: string
		userId?: string
	}): Promise<string> {
		const rows = await this.sql`
			INSERT INTO webhook_events (
				webhook_id,
				event_name,
				payload,
				org_id,
				user_id,
				status,
				attempts,
				created_at
			)
			VALUES (
				${data.webhookId},
				${data.eventName},
				${JSON.stringify(data.payload)},
				${data.orgId || null},
				${data.userId || null},
				'pending',
				0,
				NOW()
			)
			RETURNING id
		`

		return (rows[0] as { id: string }).id
	}

	/**
	 * Get webhook event
	 */
	private async getEvent(eventId: string): Promise<
		| (WebhookEvent & {
				payload: Record<string, unknown>
		  })
		| null
	> {
		const rows = await this.sql`
			SELECT
				id,
				webhook_id as "webhookId",
				event_name as "eventName",
				payload,
				status,
				attempts,
				response_code as "responseCode",
				response_body as "responseBody",
				error,
				created_at as "createdAt",
				last_attempt_at as "lastAttemptAt",
				delivered_at as "deliveredAt"
			FROM webhook_events
			WHERE id = ${eventId}
		`

		if (rows.length === 0) return null

		const event = rows[0] as {
			id: string
			webhookId: string
			eventName: string
			payload: string
			status: WebhookEventStatus
			attempts: number
			responseCode?: number
			responseBody?: string
			error?: string
			createdAt: string
			lastAttemptAt?: string
			deliveredAt?: string
		}

		return {
			...event,
			payload: JSON.parse(event.payload),
		}
	}

	/**
	 * Update webhook event
	 */
	private async updateEvent(
		eventId: string,
		data: {
			status?: WebhookEventStatus
			attempts?: number
			responseCode?: number
			responseBody?: string
			error?: string
			lastAttemptAt?: string
			deliveredAt?: string
		},
	): Promise<void> {
		const updates: string[] = []
		const values: unknown[] = []

		if (data.status !== undefined) {
			updates.push(`status = $${updates.length + 1}`)
			values.push(data.status)
		}

		if (data.attempts !== undefined) {
			updates.push(`attempts = $${updates.length + 1}`)
			values.push(data.attempts)
		}

		if (data.responseCode !== undefined) {
			updates.push(`response_code = $${updates.length + 1}`)
			values.push(data.responseCode)
		}

		if (data.responseBody !== undefined) {
			updates.push(`response_body = $${updates.length + 1}`)
			values.push(data.responseBody)
		}

		if (data.error !== undefined) {
			updates.push(`error = $${updates.length + 1}`)
			values.push(data.error)
		}

		if (data.lastAttemptAt !== undefined) {
			updates.push(`last_attempt_at = $${updates.length + 1}`)
			values.push(data.lastAttemptAt)
		}

		if (data.deliveredAt !== undefined) {
			updates.push(`delivered_at = $${updates.length + 1}`)
			values.push(data.deliveredAt)
		}

		if (updates.length === 0) return

		values.push(eventId)

		const sql = `UPDATE webhook_events SET ${updates.join(', ')} WHERE id = $${values.length}`

		await this.sql.unsafe(sql, values)
	}

	/**
	 * Retry failed events
	 * Useful for batch retry processing
	 */
	async retryFailedEvents(limit = 100): Promise<number> {
		const events = await this.sql`
			SELECT
				we.id as "eventId",
				w.id as "webhookId",
				w.url,
				w.events,
				w.secret
			FROM webhook_events we
			INNER JOIN webhooks w ON w.id = we.webhook_id
			WHERE we.status = 'pending'
			  AND we.attempts < ${this.maxAttempts}
			  AND w.enabled = true
			ORDER BY we.created_at ASC
			LIMIT ${limit}
		`

		let retried = 0

		for (const event of events) {
			const e = event as {
				eventId: string
				webhookId: string
				url: string
				events: string
				secret: string
			}

			const webhook: Webhook = {
				id: e.webhookId,
				url: e.url,
				events: JSON.parse(e.events),
				secret: e.secret,
				enabled: true,
				createdAt: '',
				updatedAt: '',
			}

			try {
				await this.deliverEvent(e.eventId, webhook)
				retried++
			} catch (err) {
				this.logger.error('Failed to retry webhook event', {
					eventId: e.eventId,
					error: err,
				})
			}
		}

		return retried
	}
}
