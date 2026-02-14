/**
 * Zod schema for runtime validation of BunbaseConfig.
 * Provides rich validation rules, conditional logic, and clear error messages.
 */

import { z } from 'zod'

// Helper schemas
const portSchema = z
	.number()
	.int()
	.min(1, 'Port must be at least 1')
	.max(65535, 'Port must be at most 65535')

const urlSchema = z
	.string()
	.url('Must be a valid URL')
	.or(z.string().regex(/^redis:\/\//, 'Redis URL must start with redis://'))

const emailSchema = z.string().email('Must be a valid email address')

// CORS schema
const corsSchema = z
	.object({
		origin: z.union([z.string(), z.array(z.string()), z.boolean()]).optional(),
		credentials: z.boolean().optional(),
		methods: z.array(z.string()).optional(),
		headers: z.array(z.string()).optional(),
		exposedHeaders: z.array(z.string()).optional(),
		maxAge: z.number().int().positive().optional(),
	})
	.optional()

// Database schema
const databaseSchema = z
	.object({
		url: z.string().min(1, 'Database URL cannot be empty').optional(),
		maxConnections: z.number().int().positive().optional(),
		idleTimeout: z.number().int().positive().optional(),
		migrations: z
			.object({
				directory: z.string().min(1).optional(),
			})
			.optional(),
		seeds: z
			.object({
				directory: z.string().min(1).optional(),
			})
			.optional(),
	})
	.optional()

// Redis schema
const redisSchema = z
	.object({
		url: z.string().min(1, 'Redis URL cannot be empty').optional(),
		connectionTimeout: z.number().int().positive().optional(),
		idleTimeout: z.number().int().positive().optional(),
		autoReconnect: z.boolean().optional(),
		maxRetries: z.number().int().positive().optional(),
		tls: z.boolean().optional(),
	})
	.optional()

// Auth schema
const authSchema = z
	.object({
		sessionSecret: z
			.string()
			.min(32, 'Session secret must be at least 32 characters'),
		expiresIn: z.number().int().positive().optional(),
		cookie: z
			.object({
				name: z.string().min(1).optional(),
				secure: z.boolean().optional(),
			})
			.optional(),
	})
	.optional()

// Guards schema
const guardsSchema = z
	.object({
		defaultMode: z.enum(['sequential', 'parallel']).optional(),
	})
	.optional()

// Persistence schema
const persistenceSchema = z
	.object({
		enabled: z.boolean().optional(),
		flushIntervalMs: z.number().int().positive().optional(),
		maxBufferSize: z.number().int().positive().optional(),
	})
	.optional()

// Storage schema with conditional validation
const storageSchema = z
	.object({
		adapter: z.enum(['local', 's3']).optional(),
		local: z
			.object({
				directory: z.string().min(1).optional(),
			})
			.optional(),
		s3: z
			.object({
				bucket: z.string().min(1, 'S3 bucket is required'),
				region: z.string().optional(),
				endpoint: z.string().url().optional(),
				accessKeyId: z.string().min(1, 'S3 access key ID is required'),
				secretAccessKey: z.string().min(1, 'S3 secret access key is required'),
			})
			.optional(),
	})
	.optional()
	.refine(
		(storage) => {
			if (!storage) return true
			if (storage.adapter === 's3' && !storage.s3) {
				return false
			}
			return true
		},
		{
			message: 'S3 configuration is required when adapter is "s3"',
		},
	)

// Mailer schema with conditional validation
const mailerSchema = z
	.object({
		provider: z
			.enum(['smtp', 'resend', 'sendgrid', 'mailgun', 'ses'])
			.optional(),
		from: z.object({
			name: z.string().min(1, 'From name is required'),
			email: emailSchema,
		}),
		smtp: z
			.object({
				host: z.string().min(1, 'SMTP host is required'),
				port: portSchema,
				secure: z.boolean().optional(),
				auth: z.object({
					user: z.string().min(1, 'SMTP user is required'),
					pass: z.string().min(1, 'SMTP password is required'),
				}),
			})
			.optional(),
		resend: z
			.object({
				apiKey: z.string().min(1, 'Resend API key is required'),
			})
			.optional(),
		sendgrid: z
			.object({
				apiKey: z.string().min(1, 'SendGrid API key is required'),
			})
			.optional(),
		mailgun: z
			.object({
				apiKey: z.string().min(1, 'Mailgun API key is required'),
				domain: z.string().min(1, 'Mailgun domain is required'),
			})
			.optional(),
		ses: z
			.object({
				region: z.string().min(1, 'AWS region is required'),
				accessKeyId: z.string().min(1, 'AWS access key ID is required'),
				secretAccessKey: z.string().min(1, 'AWS secret access key is required'),
			})
			.optional(),
	})
	.optional()
	.refine(
		(mailer) => {
			if (!mailer) return true
			const provider = mailer.provider || 'smtp'
			switch (provider) {
				case 'smtp':
					return !!mailer.smtp
				case 'resend':
					return !!mailer.resend
				case 'sendgrid':
					return !!mailer.sendgrid
				case 'mailgun':
					return !!mailer.mailgun
				case 'ses':
					return !!mailer.ses
				default:
					return true
			}
		},
		{
			message:
				'Provider-specific configuration is required when mailer is configured',
		},
	)

// OpenAPI schema
const openapiSchema = z
	.object({
		enabled: z.boolean(),
		path: z.string().optional(),
		title: z.string().optional(),
		version: z.string().optional(),
	})
	.optional()

// Studio schema
const studioSchema = z
	.object({
		enabled: z.boolean().optional(),
		path: z.string().optional(),
		apiPrefix: z.string().optional(),
	})
	.optional()

// Realtime schema
const realtimeSchema = z
	.object({
		enabled: z.boolean().optional(),
		path: z.string().optional(),
		maxConnections: z.number().int().positive().optional(),
		pingIntervalMs: z.number().int().positive().optional(),
		idleTimeoutMs: z.number().int().positive().optional(),
		rateLimit: z
			.object({
				maxMessages: z.number().int().positive(),
				windowMs: z.number().int().positive(),
			})
			.optional(),
		maxPayloadLength: z.number().int().positive().optional(),
	})
	.optional()

// Main config schema
export const bunbaseConfigSchema: z.ZodObject<any> = z.object({
	port: portSchema.optional(),
	hostname: z.string().optional(),
	actionsDir: z.string().optional(),
	watch: z.boolean().optional(),
	maxRequestBodySize: z.number().int().positive().optional(),
	cors: corsSchema,
	database: databaseSchema,
	redis: redisSchema,
	auth: authSchema,
	guards: guardsSchema,
	persistence: persistenceSchema,
	storage: storageSchema,
	mailer: mailerSchema,
	saas: z.boolean().optional(),
	mcp: z.boolean().optional(),
	openapi: openapiSchema,
	studio: studioSchema,
	realtime: realtimeSchema,
})

export type ValidatedBunbaseConfig = z.infer<typeof bunbaseConfigSchema>
