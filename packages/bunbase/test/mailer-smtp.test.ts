import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { SMTPMailerAdapter } from '../src/mailer/adapters/smtp-adapter.ts'

// Mock nodemailer
const mockSendMail = mock()
const mockCreateTransport = mock(() => ({
	sendMail: mockSendMail,
}))

// Replace nodemailer module
import nodemailer from 'nodemailer'
;(nodemailer as any).createTransport = mockCreateTransport

describe('SMTPMailerAdapter', () => {
	let adapter: SMTPMailerAdapter

	beforeEach(() => {
		mockSendMail.mockClear()
		mockCreateTransport.mockClear()

		mockSendMail.mockImplementation(() =>
			Promise.resolve({ messageId: 'test' }),
		)

		adapter = new SMTPMailerAdapter(
			{
				host: 'smtp.example.com',
				port: 587,
				secure: false,
				auth: { user: 'test-user', pass: 'test-pass' },
			},
			{ name: 'Test Sender', email: 'sender@example.com' },
		)
	})

	test('should create transport with correct config', () => {
		expect(mockCreateTransport).toHaveBeenCalledTimes(1)
		const config = mockCreateTransport.mock.calls[0][0]
		expect(config.host).toBe('smtp.example.com')
		expect(config.port).toBe(587)
		expect(config.secure).toBe(false)
		expect(config.auth).toEqual({ user: 'test-user', pass: 'test-pass' })
	})

	test('should send simple email', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test HTML</p>',
			text: 'Test Text',
		})

		expect(mockSendMail).toHaveBeenCalledTimes(1)
		const mailOptions = mockSendMail.mock.calls[0][0]

		expect(mailOptions.from).toBe('"Test Sender" <sender@example.com>')
		expect(mailOptions.to).toBe('recipient@example.com')
		expect(mailOptions.subject).toBe('Test Subject')
		expect(mailOptions.html).toBe('<p>Test HTML</p>')
		expect(mailOptions.text).toBe('Test Text')
	})

	test('should send email to multiple recipients', async () => {
		await adapter.send({
			to: ['user1@example.com', 'user2@example.com'],
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.to).toBe('user1@example.com, user2@example.com')
	})

	test('should include CC recipients', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			cc: ['cc1@example.com', 'cc2@example.com'],
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.cc).toBe('cc1@example.com, cc2@example.com')
	})

	test('should include single CC recipient', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			cc: 'cc@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.cc).toBe('cc@example.com')
	})

	test('should include BCC recipients', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			bcc: 'bcc@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.bcc).toBe('bcc@example.com')
	})

	test('should include reply-to header', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			replyTo: 'reply@example.com',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.replyTo).toBe('reply@example.com')
	})

	test('should override default from address', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test</p>',
			from: { name: 'Custom Sender', email: 'custom@example.com' },
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.from).toBe('"Custom Sender" <custom@example.com>')
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
					encoding: 'base64',
				},
			],
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.attachments).toHaveLength(1)
		expect(mailOptions.attachments[0].filename).toBe('test.txt')
		expect(mailOptions.attachments[0].content).toBe(buffer)
		expect(mailOptions.attachments[0].contentType).toBe('text/plain')
		expect(mailOptions.attachments[0].encoding).toBe('base64')
	})

	test('should default secure to false', () => {
		mockCreateTransport.mockClear()
		new SMTPMailerAdapter(
			{
				host: 'smtp.example.com',
				port: 587,
				auth: { user: 'test', pass: 'pass' },
			},
			{ name: 'Test', email: 'test@example.com' },
		)

		const config = mockCreateTransport.mock.calls[0][0]
		expect(config.secure).toBe(false)
	})

	test('should support secure connection', () => {
		mockCreateTransport.mockClear()
		new SMTPMailerAdapter(
			{
				host: 'smtp.example.com',
				port: 465,
				secure: true,
				auth: { user: 'test', pass: 'pass' },
			},
			{ name: 'Test', email: 'test@example.com' },
		)

		const config = mockCreateTransport.mock.calls[0][0]
		expect(config.secure).toBe(true)
	})

	test('should send email with only HTML content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			html: '<p>Test HTML</p>',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.html).toBe('<p>Test HTML</p>')
		expect(mailOptions.text).toBeUndefined()
	})

	test('should send email with only text content', async () => {
		await adapter.send({
			to: 'recipient@example.com',
			subject: 'Test Subject',
			text: 'Test Text',
		})

		const mailOptions = mockSendMail.mock.calls[0][0]
		expect(mailOptions.text).toBe('Test Text')
		expect(mailOptions.html).toBeUndefined()
	})

	test('should propagate errors from nodemailer', async () => {
		mockSendMail.mockImplementationOnce(() =>
			Promise.reject(new Error('SMTP connection failed')),
		)

		await expect(
			adapter.send({
				to: 'recipient@example.com',
				subject: 'Test',
				html: '<p>Test</p>',
			}),
		).rejects.toThrow('SMTP connection failed')
	})
})
