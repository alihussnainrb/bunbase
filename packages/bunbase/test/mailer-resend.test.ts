import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { ResendMailerAdapter } from '../src/mailer/adapters/resend-adapter.ts'

describe('ResendMailerAdapter', () => {
	let adapter: ResendMailerAdapter
	let mockFetch: ReturnType<typeof mock>

	beforeEach(() => {
		adapter = new ResendMailerAdapter(
			{ apiKey: 'test-api-key' },
			{ name: 'Test Sender', email: 'sender@example.com' },
		)

		// Mock global fetch
		mockFetch = mock(() =>
			Promise.resolve({
				ok: true,
				text: () => Promise.resolve('{"id":"email-id"}'),
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
		expect(url).toBe('https://api.resend.com/emails')
		expect(options.method).toBe('POST')
		expect(options.headers.Authorization).toBe('Bearer test-api-key')

		const body = JSON.parse(options.body)
		expect(body.from).toBe('Test Sender <sender@example.com>')
		expect(body.to).toEqual(['recipient@example.com'])
		expect(body.subject).toBe('Test Subject')
		expect(body.html).toBe('<p>Test HTML</p>')
		expect(body.text).toBe('Test Text')
	})

	test('should send email to multiple recipients', async () => {
		await adapter.send({
			to: ['user1@example.com', 'user2@example.com'],
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.to).toEqual(['user1@example.com', 'user2@example.com'])
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
		expect(body.cc).toEqual(['cc1@example.com', 'cc2@example.com'])
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
		expect(body.bcc).toEqual(['bcc@example.com'])
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
		expect(body.reply_to).toBe('reply@example.com')
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
		expect(body.from).toBe('Custom Sender <custom@example.com>')
	})

	test('should include attachments with buffer content', async () => {
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
		expect(body.attachments[0].content_type).toBe('text/plain')
	})

	test('should include attachments with string content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			attachments: [
				{
					filename: 'test.txt',
					content: 'plain string',
					contentType: 'text/plain',
				},
			],
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.attachments[0].content).toBe('plain string')
	})

	test('should throw error when API returns error', async () => {
		mockFetch = mock(() =>
			Promise.resolve({
				ok: false,
				text: () => Promise.resolve('{"error":"Invalid API key"}'),
			}),
		)
		global.fetch = mockFetch as any

		await expect(
			adapter.send({
				to: 'recipient@example.com',
				subject: 'Test',
				html: '<p>Test</p>',
			}),
		).rejects.toThrow('Resend API error')
	})

	test('should send email with only HTML content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test HTML</p>',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.html).toBe('<p>Test HTML</p>')
		expect(body.text).toBeUndefined()
	})

	test('should send email with only text content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			text: 'Test Text',
		})

		const [, options] = mockFetch.mock.calls[0]
		const body = JSON.parse(options.body)
		expect(body.text).toBe('Test Text')
		expect(body.html).toBeUndefined()
	})
})
