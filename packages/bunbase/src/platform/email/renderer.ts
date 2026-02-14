/**
 * Email Template Renderer
 * Handles variable interpolation in email templates
 */

import type { EmailTemplate } from '../core/types.ts'

// ====================================================================
// TEMPLATE RENDERER
// ====================================================================

/**
 * Email template renderer
 * Replaces {{variableName}} placeholders with actual values
 */
export class TemplateRenderer {
	/**
	 * Render a template with variables
	 * Replaces {{variableName}} with values from the variables object
	 */
	render(
		template: EmailTemplate,
		variables: Record<string, string | number | boolean>,
	): {
		subject: string
		htmlBody: string
		textBody: string | null
	} {
		// Render subject
		const subject = this.interpolate(template.subject, variables)

		// Render HTML body
		const htmlBody = this.interpolate(template.htmlBody, variables)

		// Render text body (if exists)
		const textBody = template.textBody
			? this.interpolate(template.textBody, variables)
			: null

		// Validate that all template variables were provided
		this.validateVariables(template, variables)

		return { subject, htmlBody, textBody }
	}

	/**
	 * Interpolate variables in a string
	 * Replaces {{variableName}} with actual values
	 */
	private interpolate(
		text: string,
		variables: Record<string, string | number | boolean>,
	): string {
		return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
			if (key in variables) {
				return String(variables[key])
			}
			// Leave placeholder if variable not provided
			return match
		})
	}

	/**
	 * Validate that all required variables were provided
	 * Logs warning for missing variables
	 */
	private validateVariables(
		template: EmailTemplate,
		variables: Record<string, string | number | boolean>,
	): void {
		const missing: string[] = []

		for (const varName of template.variables) {
			if (!(varName in variables)) {
				missing.push(varName)
			}
		}

		if (missing.length > 0) {
			console.warn(
				`Template "${template.key}" is missing variables: ${missing.join(', ')}`,
			)
		}
	}

	/**
	 * Extract variable names from a template string
	 * Useful for discovering variables in custom templates
	 */
	extractVariables(text: string): string[] {
		const matches = text.matchAll(/\{\{(\w+)\}\}/g)
		const variables = new Set<string>()

		for (const match of matches) {
			if (match[1]) {
				variables.add(match[1])
			}
		}

		return Array.from(variables)
	}

	/**
	 * Preview a template with sample variables
	 * Useful for testing templates in admin UI
	 */
	preview(
		template: EmailTemplate,
		sampleVariables: Record<string, string | number | boolean>,
	): {
		subject: string
		htmlBody: string
		textBody: string | null
		missingVariables: string[]
	} {
		const rendered = this.render(template, sampleVariables)

		// Find missing variables
		const missingVariables = template.variables.filter(
			(varName) => !(varName in sampleVariables),
		)

		return {
			...rendered,
			missingVariables,
		}
	}
}
