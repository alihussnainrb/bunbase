import type {
	MailerAdapter,
	SendEmailOptions,
	SendGridConfig,
} from '../types.ts'

export class SendGridMailerAdapter implements MailerAdapter {
	private apiKey: string
	private defaultFrom: { name: string; email: string }

	constructor(
		config: SendGridConfig,
		defaultFrom: { name: string; email: string },
	) {
		this.apiKey = config.apiKey
		this.defaultFrom = defaultFrom
	}

	async send(options: SendEmailOptions): Promise<void> {
		const from = options.from ?? this.defaultFrom

		const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				personalizations: [
					{
						to: (Array.isArray(options.to) ? options.to : [options.to]).map(
							(email) => ({ email }),
						),
						cc: options.cc
							? (Array.isArray(options.cc) ? options.cc : [options.cc]).map(
									(email) => ({ email }),
								)
							: undefined,
						bcc: options.bcc
							? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).map(
									(email) => ({ email }),
								)
							: undefined,
					},
				],
				from: { name: from.name, email: from.email },
				reply_to: options.replyTo ? { email: options.replyTo } : undefined,
				subject: options.subject,
				content: [
					...(options.html ? [{ type: 'text/html', value: options.html }] : []),
					...(options.text
						? [{ type: 'text/plain', value: options.text }]
						: []),
				],
				attachments: options.attachments?.map((att) => ({
					filename: att.filename,
					content: Buffer.isBuffer(att.content)
						? att.content.toString('base64')
						: Buffer.from(att.content).toString('base64'),
					type: att.contentType ?? 'application/octet-stream',
					disposition: 'attachment',
				})),
			}),
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`SendGrid API error: ${error}`)
		}
	}
}
