/**
 * Email Sender
 * Wraps mailer adapter and tracks email delivery
 */

import type { DatabaseClient } from '../../db/client.ts'
import type { Logger } from '../../logger/index.ts'
import type { MailerAdapter } from '../../mailer/types.ts'
import type { TemplateManager } from './template-manager.ts'
import type { TemplateRenderer } from './renderer.ts'
import type { EmailMessage, EmailMessageStatus, UserId, TemplateId } from '../core/types.ts'
import { EmailSendError, TemplateNotFoundError } from '../core/errors.ts'

// ====================================================================
// EMAIL SENDER
// ====================================================================

/**
 * Email sender with delivery tracking
 * Integrates template manager, renderer, and mailer adapter
 */
export class EmailSender {
	constructor(
		private readonly db: DatabaseClient,
		private readonly mailer: MailerAdapter,
		private readonly templateManager: TemplateManager,
		private readonly renderer: TemplateRenderer,
		private readonly logger: Logger,
		private readonly fromEmail: string,
	) {}

	// ====================================================================
	// SEND EMAIL FROM TEMPLATE
	// ====================================================================

	/**
	 * Send an email using a template
	 * Retrieves template, renders with variables, sends, and tracks delivery
	 */
	async sendFromTemplate(data: {
		templateKey: string
		toEmail: string
		variables: Record<string, string | number | boolean>
		userId?: UserId
	}): Promise<{ messageId: string }> {
		const { templateKey, toEmail, variables, userId } = data

		try {
			// Get template
			const template = await this.templateManager.getByKey(templateKey)

			// Render template with variables
			const rendered = this.renderer.render(template, variables)

			// Create email message record
			const messageId = crypto.randomUUID()
			await this.db
				.from('email_messages')
				.insert({
					id: messageId,
					template_id: template.id,
					user_id: userId ?? null,
					to_email: toEmail,
					from_email: this.fromEmail,
					subject: rendered.subject,
					html_body: rendered.htmlBody,
					text_body: rendered.textBody,
					status: 'pending',
					sent_at: null,
					failed_at: null,
					error_message: null,
					attempts: 0,
					max_attempts: 3,
					next_retry_at: null,
					provider_message_id: null,
					provider_metadata: null,
					created_at: new Date().toISOString(),
				})

			// Send email
			try {
				await this.mailer.send({
					to: toEmail,
					from: { name: 'Bunbase', email: this.fromEmail },
					subject: rendered.subject,
					html: rendered.htmlBody,
					text: rendered.textBody ?? undefined,
				})

				// Update message status to sent
				await this.db
					.from('email_messages')
					.eq('id', messageId)
					.update({
						status: 'sent',
						sent_at: new Date().toISOString(),
						attempts: 1,
						provider_message_id: null,
						provider_metadata: null,
					})

				this.logger.info('Email sent', {
					messageId,
					templateKey,
					toEmail,
				})

				return { messageId }
			} catch (sendErr) {
				// Update message status to failed
				await this.db
					.from('email_messages')
					.eq('id', messageId)
					.update({
						status: 'failed',
						failed_at: new Date().toISOString(),
						error_message:
							sendErr instanceof Error ? sendErr.message : String(sendErr),
						attempts: 1,
						next_retry_at: this.calculateNextRetry(1),
					})

				this.logger.error('Failed to send email', {
					error: sendErr,
					messageId,
					templateKey,
					toEmail,
				})

				throw new EmailSendError(
					sendErr instanceof Error ? sendErr.message : 'Unknown error',
					{ messageId, templateKey },
				)
			}
		} catch (err) {
			if (
				err instanceof TemplateNotFoundError ||
				err instanceof EmailSendError
			) {
				throw err
			}

			this.logger.error('Failed to send email from template', {
				error: err,
				templateKey,
				toEmail,
			})
			throw new EmailSendError('Failed to send email', { templateKey })
		}
	}

	// ====================================================================
	// SEND CUSTOM EMAIL
	// ====================================================================

	/**
	 * Send a custom email without a template
	 */
	async sendCustom(data: {
		toEmail: string
		subject: string
		htmlBody: string
		textBody?: string
		userId?: UserId
	}): Promise<{ messageId: string }> {
		const { toEmail, subject, htmlBody, textBody, userId } = data

		try {
			// Create email message record
			const messageId = crypto.randomUUID()
			await this.db
				.from('email_messages')
				.insert({
					id: messageId,
					template_id: null,
					user_id: userId ?? null,
					to_email: toEmail,
					from_email: this.fromEmail,
					subject,
					html_body: htmlBody,
					text_body: textBody ?? null,
					status: 'pending',
					sent_at: null,
					failed_at: null,
					error_message: null,
					attempts: 0,
					max_attempts: 3,
					next_retry_at: null,
					provider_message_id: null,
					provider_metadata: null,
					created_at: new Date().toISOString(),
				})

			// Send email
			try {
				await this.mailer.send({
					to: toEmail,
					from: { name: 'Bunbase', email: this.fromEmail },
					subject,
					html: htmlBody,
					text: textBody,
				})

				// Update message status to sent
				await this.db
					.from('email_messages')
					.eq('id', messageId)
					.update({
						status: 'sent',
						sent_at: new Date().toISOString(),
						attempts: 1,
						provider_message_id: null,
						provider_metadata: null,
					})

				this.logger.info('Custom email sent', {
					messageId,
					toEmail,
				})

				return { messageId }
			} catch (sendErr) {
				// Update message status to failed
				await this.db
					.from('email_messages')
					.eq('id', messageId)
					.update({
						status: 'failed',
						failed_at: new Date().toISOString(),
						error_message:
							sendErr instanceof Error ? sendErr.message : String(sendErr),
						attempts: 1,
						next_retry_at: this.calculateNextRetry(1),
					})

				this.logger.error('Failed to send custom email', {
					error: sendErr,
					messageId,
					toEmail,
				})

				throw new EmailSendError(
					sendErr instanceof Error ? sendErr.message : 'Unknown error',
					{ messageId },
				)
			}
		} catch (err) {
			if (err instanceof EmailSendError) {
				throw err
			}

			this.logger.error('Failed to send custom email', {
				error: err,
				toEmail,
			})
			throw new EmailSendError('Failed to send email')
		}
	}

	// ====================================================================
	// EMAIL RETRY
	// ====================================================================

	/**
	 * Retry failed emails (call periodically)
	 * Returns number of emails retried
	 */
	async retryFailed(): Promise<number> {
		try {
			// Get failed emails ready for retry
			const failedMessages = await this.db
				.from('email_messages')
				.select('*')
				.eq('status', 'failed')
				.lt('attempts', 3) // max_attempts
				.lte('next_retry_at', new Date().toISOString())
				.limit(50) // Process in batches
				.exec()

			let retried = 0

			for (const message of failedMessages as any[]) {
				try {
					// Retry send
					await this.mailer.send({
						to: message.to_email,
						from: { name: 'Bunbase', email: message.from_email },
						subject: message.subject,
						html: message.html_body,
						text: message.text_body,
					})

					// Update to sent
					await this.db
						.from('email_messages')
						.eq('id', message.id)
						.update({
							status: 'sent',
							sent_at: new Date().toISOString(),
							attempts: message.attempts + 1,
							provider_message_id: null,
							provider_metadata: null,
							next_retry_at: null,
						})

					retried++
					this.logger.info('Email retry succeeded', { messageId: message.id })
				} catch (retryErr) {
					const newAttempts = message.attempts + 1

					// Update failure info
					await this.db
						.from('email_messages')
						.eq('id', message.id)
						.update({
							failed_at: new Date().toISOString(),
							error_message:
								retryErr instanceof Error ? retryErr.message : String(retryErr),
							attempts: newAttempts,
							next_retry_at:
								newAttempts < 3 ? this.calculateNextRetry(newAttempts) : null,
						})

					this.logger.warn('Email retry failed', {
						messageId: message.id,
						attempts: newAttempts,
					})
				}
			}

			return retried
		} catch (err) {
			this.logger.error('Failed to retry emails', { error: err })
			return 0
		}
	}

	// ====================================================================
	// MESSAGE RETRIEVAL
	// ====================================================================

	/**
	 * Get email message by ID
	 */
	async getMessage(messageId: string): Promise<EmailMessage | null> {
		try {
			const row = await this.db
				.from('email_messages')
				.select('*')
				.eq('id', messageId)
				.maybeSingle()

			if (!row) {
				return null
			}

			return this.mapRowToMessage(row)
		} catch (err) {
			this.logger.error('Failed to get message', { error: err, messageId })
			return null
		}
	}

	/**
	 * List messages for a user
	 */
	async listUserMessages(
		userId: UserId,
		limit = 50,
	): Promise<EmailMessage[]> {
		try {
			const rows = await this.db
				.from('email_messages')
				.select('*')
				.eq('user_id', userId)
				.orderBy('created_at', 'DESC')
				.limit(limit)
				.exec()

			return rows.map((row: any) => this.mapRowToMessage(row))
		} catch (err) {
			this.logger.error('Failed to list user messages', { error: err, userId })
			return []
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Calculate next retry timestamp with exponential backoff
	 */
	private calculateNextRetry(attempts: number): string {
		// Exponential backoff: 5min, 30min, 2hr
		const delays = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000]
		const delay = delays[attempts - 1] ?? delays[delays.length - 1]!
		return new Date(Date.now() + delay).toISOString()
	}

	/**
	 * Map database row to EmailMessage type
	 */
	private mapRowToMessage(row: any): EmailMessage {
		return {
			id: row.id,
			templateId: row.template_id as TemplateId | null,
			userId: row.user_id as UserId | null,
			toEmail: row.to_email,
			fromEmail: row.from_email,
			subject: row.subject,
			htmlBody: row.html_body,
			textBody: row.text_body,
			status: row.status as EmailMessageStatus,
			sentAt: row.sent_at ? new Date(row.sent_at) : null,
			failedAt: row.failed_at ? new Date(row.failed_at) : null,
			errorMessage: row.error_message,
			attempts: row.attempts,
			maxAttempts: row.max_attempts,
			nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
			providerMessageId: row.provider_message_id,
			providerMetadata:
				typeof row.provider_metadata === 'string'
					? JSON.parse(row.provider_metadata)
					: row.provider_metadata,
			createdAt: new Date(row.created_at),
		}
	}
}
