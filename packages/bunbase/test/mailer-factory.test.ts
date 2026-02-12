import { describe, expect, test } from 'bun:test'
import { createMailer } from '../src/mailer/index.ts'

describe('Mailer Factory', () => {
	test('should return null when config is undefined', () => {
		const mailer = createMailer()
		expect(mailer).toBeNull()
	})

	test('should create SMTP adapter when provider is smtp', () => {
		const mailer = createMailer({
			provider: 'smtp',
			from: { name: 'Test', email: 'test@example.com' },
			smtp: {
				host: 'smtp.example.com',
				port: 587,
				auth: { user: 'user', pass: 'pass' },
			},
		})

		expect(mailer).not.toBeNull()
		expect(mailer?.constructor.name).toBe('SMTPMailerAdapter')
	})

	test('should create Resend adapter when provider is resend', () => {
		const mailer = createMailer({
			provider: 'resend',
			from: { name: 'Test', email: 'test@example.com' },
			resend: {
				apiKey: 'test-key',
			},
		})

		expect(mailer).not.toBeNull()
		expect(mailer?.constructor.name).toBe('ResendMailerAdapter')
	})

	test('should create SendGrid adapter when provider is sendgrid', () => {
		const mailer = createMailer({
			provider: 'sendgrid',
			from: { name: 'Test', email: 'test@example.com' },
			sendgrid: {
				apiKey: 'test-key',
			},
		})

		expect(mailer).not.toBeNull()
		expect(mailer?.constructor.name).toBe('SendGridMailerAdapter')
	})

	test('should default to smtp when provider is not specified', () => {
		const mailer = createMailer({
			from: { name: 'Test', email: 'test@example.com' },
			smtp: {
				host: 'smtp.example.com',
				port: 587,
				auth: { user: 'user', pass: 'pass' },
			},
		})

		expect(mailer).not.toBeNull()
		expect(mailer?.constructor.name).toBe('SMTPMailerAdapter')
	})

	test('should throw error when smtp provider is selected but config is missing', () => {
		expect(() => {
			createMailer({
				provider: 'smtp',
				from: { name: 'Test', email: 'test@example.com' },
			})
		}).toThrow('SMTP config required when provider is "smtp"')
	})

	test('should throw error when resend provider is selected but config is missing', () => {
		expect(() => {
			createMailer({
				provider: 'resend',
				from: { name: 'Test', email: 'test@example.com' },
			})
		}).toThrow('Resend config required when provider is "resend"')
	})

	test('should throw error when sendgrid provider is selected but config is missing', () => {
		expect(() => {
			createMailer({
				provider: 'sendgrid',
				from: { name: 'Test', email: 'test@example.com' },
			})
		}).toThrow('SendGrid config required when provider is "sendgrid"')
	})

	test('should throw error for unknown provider', () => {
		expect(() => {
			createMailer({
				provider: 'invalid' as any,
				from: { name: 'Test', email: 'test@example.com' },
			})
		}).toThrow('Unknown mailer provider: invalid')
	})
})
