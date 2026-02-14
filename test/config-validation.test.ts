import { describe, expect, test } from 'bun:test'
import {
	validateConfig,
	validatePartialConfig,
	ConfigValidationError,
	isConfigValidationError,
} from '../packages/bunbase/src/config/validator.ts'

describe('Config Validation', () => {
	describe('validateConfig', () => {
		test('accepts valid minimal config', () => {
			const config = {}
			expect(() => validateConfig(config)).not.toThrow()
		})

		test('accepts valid full config', () => {
			const config = {
				port: 3000,
				hostname: 'localhost',
				actionsDir: 'src/actions',
				watch: true,
				maxRequestBodySize: 10 * 1024 * 1024,
				cors: {
					origin: '*',
					credentials: true,
				},
				database: {
					url: 'postgresql://localhost:5432/test',
					maxConnections: 20,
				},
				auth: {
					sessionSecret: 'a'.repeat(32),
					expiresIn: 86400,
					cookie: {
						name: 'session',
						secure: true,
					},
				},
			}
			expect(() => validateConfig(config)).not.toThrow()
		})

		test('rejects invalid port (too low)', () => {
			const config = { port: 0 }
			expect(() => validateConfig(config)).toThrow(ConfigValidationError)
		})

		test('rejects invalid port (too high)', () => {
			const config = { port: 70000 }
			expect(() => validateConfig(config)).toThrow(ConfigValidationError)
		})

		test('rejects invalid port (string)', () => {
			const config = { port: '3000' }
			expect(() => validateConfig(config)).toThrow(ConfigValidationError)
		})

		test('rejects short session secret', () => {
			const config = {
				auth: {
					sessionSecret: 'tooshort',
				},
			}
			try {
				validateConfig(config)
				expect(true).toBe(false) // Should not reach here
			} catch (err) {
				expect(isConfigValidationError(err)).toBe(true)
				if (isConfigValidationError(err)) {
					expect(err.errors.length).toBeGreaterThan(0)
					expect(err.errors[0].path).toBe('auth.sessionSecret')
				}
			}
		})

		test('rejects S3 adapter without S3 config', () => {
			const config = {
				storage: {
					adapter: 's3' as const,
					// Missing s3 config
				},
			}
			try {
				validateConfig(config)
				expect(true).toBe(false) // Should not reach here
			} catch (err) {
				expect(isConfigValidationError(err)).toBe(true)
			}
		})

		test('accepts S3 adapter with S3 config', () => {
			const config = {
				storage: {
					adapter: 's3' as const,
					s3: {
						bucket: 'my-bucket',
						accessKeyId: 'key',
						secretAccessKey: 'secret',
					},
				},
			}
			expect(() => validateConfig(config)).not.toThrow()
		})

		test('rejects SMTP mailer without SMTP config', () => {
			const config = {
				mailer: {
					provider: 'smtp' as const,
					from: {
						name: 'Test',
						email: 'test@example.com',
					},
					// Missing smtp config
				},
			}
			try {
				validateConfig(config)
				expect(true).toBe(false) // Should not reach here
			} catch (err) {
				expect(isConfigValidationError(err)).toBe(true)
			}
		})

		test('accepts SMTP mailer with SMTP config', () => {
			const config = {
				mailer: {
					provider: 'smtp' as const,
					from: {
						name: 'Test',
						email: 'test@example.com',
					},
					smtp: {
						host: 'smtp.example.com',
						port: 587,
						auth: {
							user: 'user',
							pass: 'pass',
						},
					},
				},
			}
			expect(() => validateConfig(config)).not.toThrow()
		})

		test('rejects invalid email in mailer', () => {
			const config = {
				mailer: {
					from: {
						name: 'Test',
						email: 'not-an-email',
					},
				},
			}
			expect(() => validateConfig(config)).toThrow(ConfigValidationError)
		})

		test('provides structured error information', () => {
			const config = {
				port: 'invalid',
				auth: {
					sessionSecret: 'short',
				},
			}
			try {
				validateConfig(config)
				expect(true).toBe(false) // Should not reach here
			} catch (err) {
				if (isConfigValidationError(err)) {
					expect(err.errors.length).toBeGreaterThan(0)
					expect(err.format()).toContain('port')
					expect(err.format()).toContain('sessionSecret')
				}
			}
		})
	})

	describe('validatePartialConfig', () => {
		test('accepts partial config with missing fields', () => {
			const config = {
				database: {
					url: 'postgresql://localhost:5432/test',
				},
			}
			expect(() => validatePartialConfig(config)).not.toThrow()
		})

		test('still validates types in partial config', () => {
			const config = {
				port: 'invalid',
			}
			expect(() => validatePartialConfig(config)).toThrow(ConfigValidationError)
		})

		test('accepts empty partial config', () => {
			const config = {}
			expect(() => validatePartialConfig(config)).not.toThrow()
		})
	})

	describe('ConfigValidationError', () => {
		test('formats error message correctly', () => {
			const error = new ConfigValidationError('Test error', [
				{
					path: 'port',
					message: 'Port must be a number',
					expected: 'number',
					received: 'string',
				},
			])

			const formatted = error.format()
			expect(formatted).toContain('Test error')
			expect(formatted).toContain('port')
			expect(formatted).toContain('Port must be a number')
			expect(formatted).toContain('Expected: number')
			expect(formatted).toContain('Received: "string"')
		})

		test('isConfigValidationError type guard works', () => {
			const error = new ConfigValidationError('Test', [])
			expect(isConfigValidationError(error)).toBe(true)
			expect(isConfigValidationError(new Error('Test'))).toBe(false)
			expect(isConfigValidationError('not an error')).toBe(false)
		})
	})
})
