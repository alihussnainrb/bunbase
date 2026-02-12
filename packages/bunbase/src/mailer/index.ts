import { ResendMailerAdapter } from './adapters/resend-adapter.ts'
import { SendGridMailerAdapter } from './adapters/sendgrid-adapter.ts'
import { SMTPMailerAdapter } from './adapters/smtp-adapter.ts'
import type { MailerAdapter, MailerConfig } from './types.ts'

export * from './types.ts'

export function createMailer(config?: MailerConfig): MailerAdapter | null {
	if (!config) {
		return null
	}

	const provider = config.provider ?? 'smtp'

	if (provider === 'smtp') {
		if (!config.smtp) {
			throw new Error('SMTP config required when provider is "smtp"')
		}
		return new SMTPMailerAdapter(config.smtp, config.from)
	}

	if (provider === 'resend') {
		if (!config.resend) {
			throw new Error('Resend config required when provider is "resend"')
		}
		return new ResendMailerAdapter(config.resend, config.from)
	}

	if (provider === 'sendgrid') {
		if (!config.sendgrid) {
			throw new Error('SendGrid config required when provider is "sendgrid"')
		}
		return new SendGridMailerAdapter(config.sendgrid, config.from)
	}

	throw new Error(`Unknown mailer provider: ${provider}`)
}
