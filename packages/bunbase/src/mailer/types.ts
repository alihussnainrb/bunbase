export interface EmailAttachment {
	filename: string
	content: Buffer | string
	contentType?: string
	encoding?: string
}

export interface SendEmailOptions {
	to: string | string[]
	subject: string
	html?: string
	text?: string
	cc?: string | string[]
	bcc?: string | string[]
	replyTo?: string
	attachments?: EmailAttachment[]
	from?: { name: string; email: string } // override default
}

export interface MailerAdapter {
	send(options: SendEmailOptions): Promise<void>
}

export interface MailerConfig {
	provider?: 'smtp' | 'resend' | 'sendgrid' | 'mailgun' | 'ses'
	from: {
		name: string
		email: string
	}
	smtp?: SMTPConfig
	resend?: ResendConfig
	sendgrid?: SendGridConfig
	mailgun?: MailgunConfig
	ses?: SESConfig
}

export interface SMTPConfig {
	host: string
	port: number
	secure?: boolean
	auth: {
		user: string
		pass: string
	}
}

export interface ResendConfig {
	apiKey: string
}

export interface SendGridConfig {
	apiKey: string
}

export interface MailgunConfig {
	apiKey: string
	domain: string
}

export interface SESConfig {
	region: string
	accessKeyId: string
	secretAccessKey: string
}
