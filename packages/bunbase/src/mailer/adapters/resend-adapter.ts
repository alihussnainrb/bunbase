import type { MailerAdapter, ResendConfig, SendEmailOptions } from '../types.ts'

export class ResendMailerAdapter implements MailerAdapter {
	private apiKey: string
	private defaultFrom: { name: string; email: string }

	constructor(
		config: ResendConfig,
		defaultFrom: { name: string; email: string },
	) {
		this.apiKey = config.apiKey
		this.defaultFrom = defaultFrom
	}

	async send(options: SendEmailOptions): Promise<void> {
		const from = options.from ?? this.defaultFrom

		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: `${from.name} <${from.email}>`,
				to: Array.isArray(options.to) ? options.to : [options.to],
				cc: options.cc
					? Array.isArray(options.cc)
						? options.cc
						: [options.cc]
					: undefined,
				bcc: options.bcc
					? Array.isArray(options.bcc)
						? options.bcc
						: [options.bcc]
					: undefined,
				reply_to: options.replyTo,
				subject: options.subject,
				html: options.html,
				text: options.text,
				attachments: options.attachments?.map((att) => ({
					filename: att.filename,
					content: Buffer.isBuffer(att.content)
						? att.content.toString('base64')
						: att.content,
					content_type: att.contentType,
				})),
			}),
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Resend API error: ${error}`)
		}
	}
}
