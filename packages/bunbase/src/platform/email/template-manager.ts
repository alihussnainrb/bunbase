/**
 * Email Template Manager
 * Handles CRUD operations for email templates
 */

import type { DatabaseClient } from '../../db/client.ts'
import type { Logger } from '../../logger/index.ts'
import type { EmailTemplate, TemplateId } from '../core/types.ts'
import { TemplateNotFoundError } from '../core/errors.ts'
import { newTemplateId } from '../core/ids.ts'

// ====================================================================
// TEMPLATE MANAGER
// ====================================================================

/**
 * Email template manager
 * Manages email template CRUD and retrieval
 */
export class TemplateManager {
	constructor(
		private readonly db: DatabaseClient,
		private readonly logger: Logger,
	) {}

	// ====================================================================
	// TEMPLATE RETRIEVAL
	// ====================================================================

	/**
	 * Get template by key (e.g., "auth-verify-email")
	 */
	async getByKey(key: string): Promise<EmailTemplate> {
		try {
			const row = await this.db
				.from('email_templates')
				.select('*')
				.eq('key', key)
				.eq('is_active', true)
				.maybeSingle()

			if (!row) {
				throw new TemplateNotFoundError(key)
			}

			return this.mapRowToTemplate(row)
		} catch (err) {
			if (err instanceof TemplateNotFoundError) {
				throw err
			}
			this.logger.error('Failed to get template by key', { error: err, key })
			throw new Error('Failed to retrieve template')
		}
	}

	/**
	 * Get template by ID
	 */
	async getById(id: TemplateId): Promise<EmailTemplate> {
		try {
			const row = await this.db
				.from('email_templates')
				.select('*')
				.eq('id', id)
				.maybeSingle()

			if (!row) {
				throw new TemplateNotFoundError(id)
			}

			return this.mapRowToTemplate(row)
		} catch (err) {
			if (err instanceof TemplateNotFoundError) {
				throw err
			}
			this.logger.error('Failed to get template by ID', { error: err, id })
			throw new Error('Failed to retrieve template')
		}
	}

	/**
	 * List all active templates
	 */
	async listActive(): Promise<EmailTemplate[]> {
		try {
			const rows = await this.db
				.from('email_templates')
				.select('*')
				.eq('is_active', true)
				.orderBy('name', 'ASC')
				.exec()

			return rows.map((row: any) => this.mapRowToTemplate(row))
		} catch (err) {
			this.logger.error('Failed to list templates', { error: err })
			return []
		}
	}

	/**
	 * List all templates (including inactive)
	 */
	async listAll(): Promise<EmailTemplate[]> {
		try {
			const rows = await this.db
				.from('email_templates')
				.select('*')
				.orderBy('name', 'ASC')
				.exec()

			return rows.map((row: any) => this.mapRowToTemplate(row))
		} catch (err) {
			this.logger.error('Failed to list all templates', { error: err })
			return []
		}
	}

	// ====================================================================
	// TEMPLATE CREATION
	// ====================================================================

	/**
	 * Create a new email template
	 */
	async create(data: {
		key: string
		name: string
		description?: string
		subject: string
		htmlBody: string
		textBody?: string
		variables?: string[]
	}): Promise<EmailTemplate> {
		const {
			key,
			name,
			description,
			subject,
			htmlBody,
			textBody,
			variables = [],
		} = data

		// Check if key already exists
		const existing = await this.db
			.from('email_templates')
			.select('id')
			.eq('key', key)
			.maybeSingle()

		if (existing) {
			throw new Error(`Template with key "${key}" already exists`)
		}

		const templateId = newTemplateId()

		try {
			const row = await this.db
				.from('email_templates')
				.insert({
					id: templateId,
					key,
					name,
					description: description ?? null,
					subject,
					html_body: htmlBody,
					text_body: textBody ?? null,
					variables: JSON.stringify(variables),
					is_active: true,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})

			this.logger.info('Email template created', { templateId, key })

			return this.mapRowToTemplate(row)
		} catch (err) {
			this.logger.error('Failed to create template', { error: err, key })
			throw new Error('Failed to create template')
		}
	}

	// ====================================================================
	// TEMPLATE UPDATE
	// ====================================================================

	/**
	 * Update an existing template
	 */
	async update(
		id: TemplateId,
		data: {
			name?: string
			description?: string
			subject?: string
			htmlBody?: string
			textBody?: string
			variables?: string[]
			isActive?: boolean
		},
	): Promise<EmailTemplate> {
		const updateData: any = {}

		if (data.name !== undefined) updateData.name = data.name
		if (data.description !== undefined) updateData.description = data.description
		if (data.subject !== undefined) updateData.subject = data.subject
		if (data.htmlBody !== undefined) updateData.html_body = data.htmlBody
		if (data.textBody !== undefined) updateData.text_body = data.textBody
		if (data.variables !== undefined)
			updateData.variables = JSON.stringify(data.variables)
		if (data.isActive !== undefined) updateData.is_active = data.isActive

		if (Object.keys(updateData).length === 0) {
			throw new Error('No fields to update')
		}

		updateData.updated_at = new Date().toISOString()

		try{
			const [row] = await this.db
				.from('email_templates')
				.eq('id', id)
				.update(updateData)

			if (!row) {
				throw new TemplateNotFoundError(id)
			}

			this.logger.info('Email template updated', { id })

			return this.mapRowToTemplate(row)
		} catch (err) {
			if (err instanceof TemplateNotFoundError) {
				throw err
			}
			this.logger.error('Failed to update template', { error: err, id })
			throw new Error('Failed to update template')
		}
	}

	// ====================================================================
	// TEMPLATE DELETION
	// ====================================================================

	/**
	 * Delete a template (soft delete by setting is_active = false)
	 */
	async delete(id: TemplateId): Promise<void> {
		try {
			await this.db
				.from('email_templates')
				.eq('id', id)
				.update({
					is_active: false,
					updated_at: new Date().toISOString(),
				})

			this.logger.info('Email template deleted', { id })
		} catch (err) {
			this.logger.error('Failed to delete template', { error: err, id })
			throw new Error('Failed to delete template')
		}
	}

	/**
	 * Hard delete a template (permanent)
	 */
	async hardDelete(id: TemplateId): Promise<void> {
		try {
			await this.db.from('email_templates').eq('id', id).delete()

			this.logger.info('Email template permanently deleted', { id })
		} catch (err) {
			this.logger.error('Failed to permanently delete template', { error: err, id })
			throw new Error('Failed to delete template')
		}
	}

	// ====================================================================
	// HELPERS
	// ====================================================================

	/**
	 * Map database row to EmailTemplate type
	 */
	private mapRowToTemplate(row: any): EmailTemplate {
		return {
			id: row.id as TemplateId,
			key: row.key,
			name: row.name,
			description: row.description,
			subject: row.subject,
			htmlBody: row.html_body,
			textBody: row.text_body,
			variables:
				typeof row.variables === 'string'
					? JSON.parse(row.variables)
					: row.variables,
			isActive: row.is_active,
			createdAt: new Date(row.created_at),
			updatedAt: new Date(row.updated_at),
		}
	}
}
