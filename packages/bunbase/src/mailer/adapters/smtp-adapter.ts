import nodemailer from 'nodemailer'
import type { MailerAdapter, SendEmailOptions, SMTPConfig } from '../types.ts'

export class SMTPMailerAdapter implements MailerAdapter {
	private transporter: nodemailer.Transporter
	private defaultFrom: { name: string; email: string }

	constructor(
		config: SMTPConfig,
		defaultFrom: { name: string; email: string },
	) {
		this.defaultFrom = defaultFrom
		this.transporter = nodemailer.createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure ?? false,
			auth: config.auth,
		})
	}

	async send(options: SendEmailOptions): Promise<void> {
		const from = options.from ?? this.defaultFrom
		await this.transporter.sendMail({
			from: `"${from.name}" <${from.email}>`,
			to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
			cc: options.cc
				? Array.isArray(options.cc)
					? options.cc.join(', ')
					: options.cc
				: undefined,
			bcc: options.bcc
				? Array.isArray(options.bcc)
					? options.bcc.join(', ')
					: options.bcc
				: undefined,
			replyTo: options.replyTo,
			subject: options.subject,
			html: options.html,
			text: options.text,
			attachments: options.attachments?.map((att) => ({
				filename: att.filename,
				content: att.content,
				contentType: att.contentType,
				encoding: att.encoding as any,
			})),
		})
	}
}
