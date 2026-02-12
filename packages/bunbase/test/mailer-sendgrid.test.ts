import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { SendGridMailerAdapter } from '../src/mailer/adapters/sendgrid-adapter.ts'

describe('SendGridMailerAdapter', () => {
	let adapter: SendGridMailerAdapter
	let mockFetch: ReturnType<typeof mock>

	beforeEach(() => {
		adapter = new SendGridMailerAdapter(
			{ apiKey: 'test-api-key' },
			{ name: 'Test Sender', email: 'sender@example.com' },
		)

		mockFetch = mock(() =>
			Promise.resolve({
				ok: true,
				text: () => Promise.resolve(''),
			}),
		)
		global.fetch = mockFetch as any
	})

	test('should send simple email', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test HTML</p>',
			text: 'Test Text',
		})

		expect(mockFetch).toHaveBeenCalledTimes(1)

		const [url, options] = mockFetch.mock.calls[0]
		expect(url).toBe('https://api.sendgrid.com/v3/mail/send')
		expect(options.method).toBe('POST')
		expect(options.headers.Authorization).toBe('Bearer test-api-key')

		const body = JSON.parse(options.body)
		expect(body.from).toEqual({
			name: 'Test Sender',
			email: 'sender@example.com',
		})
		expect(body.personalizations[0].to).toEqual([
			{ email: 'recipient@example.com' },
		])
		expect(body.subject).toBe('Test Subject')
		expect(body.content).toHaveLength(2)
		expect(body.content[0]).toEqual({
			type: 'text/html',
			value: '<p>Test HTML</p>',
		})
		expect(body.content[1]).toEqual({ type: 'text/plain', value: 'Test Text' })
	})

	test('should send email to multiple recipients', async () => {
		await adapter.send({
			to: ['user1@example.com', 'user2@example.com'],
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.personalizations[0].to).toEqual([
			{ email: 'user1@example.com' },
			{ email: 'user2@example.com' },
		])
	})

	test('should include CC recipients', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			cc: ['cc1@example.com', 'cc2@example.com'],
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.personalizations[0].cc).toEqual([
			{ email: 'cc1@example.com' },
			{ email: 'cc2@example.com' },
		])
	})

	test('should include BCC recipients', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			bcc: 'bcc@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.personalizations[0].bcc).toEqual([{ email: 'bcc@example.com' }])
	})

	test('should include reply-to header', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			replyTo: 'reply@example.com',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.reply_to).toEqual({ email: 'reply@example.com' })
	})

	test('should override default from address', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			from: { name: 'Custom Sender', email: 'custom@example.com' },
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.from).toEqual({
			name: 'Custom Sender',
			email: 'custom@example.com',
		})
	})

	test('should include attachments', async () => {
		const buffer = Buffer.from('test content')

		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			attachments: [
				{
					filename: 'test.txt',
					content: buffer,
					contentType: 'text/plain',
				},
			],
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.attachments).toHaveLength(1)
		expect(body.attachments[0].filename).toBe('test.txt')
		expect(body.attachments[0].content).toBe(buffer.toString('base64'))
		expect(body.attachments[0].type).toBe('text/plain')
		expect(body.attachments[0].disposition).toBe('attachment')
	})

	test('should convert string content to base64', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			attachments: [
				{
					filename: 'test.txt',
					content: 'plain string',
				},
			],
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.attachments[0].content).toBe(
			Buffer.from('plain string').toString('base64'),
		)
	})

	test('should default contentType to application/octet-stream', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			attachments: [
				{
					filename: 'file.bin',
					content: Buffer.from('data'),
				},
			],
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.attachments[0].type).toBe('application/octet-stream')
	})

	test('should throw error when API returns error', async () => {
		mockFetch = mock(() =>
			Promise.resolve({
				ok: false,
				text: () =>
					Promise.resolve('{"errors":[{"message":"Invalid API key"}]}'),
			}),
		)
		global.fetch = mockFetch as any

		await expect(
			adapter.send({
				to: 'recipient@example.com',
				subject: 'Test',
				html: '<p>Test</p>',
			}),
		).rejects.toThrow('SendGrid API error')
	})

	test('should send email with only HTML content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test HTML</p>',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.content).toHaveLength(1)
		expect(body.content[0]).toEqual({
			type: 'text/html',
			value: '<p>Test HTML</p>',
		})
	})

	test('should send email with only text content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			text: 'Test Text',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.content).toHaveLength(1)
		expect(body.content[0]).toEqual({ type: 'text/plain', value: 'Test Text' })
	})
})
