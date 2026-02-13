export interface BunbaseConfig {
	/** HTTP server port (default: 3000) */
	port?: number
	/** HTTP server host (default: 0.0.0.0) */
	hostname?: string

	/** Directory to scan for actions and modules (default: src/actions) */
	actionsDir?: string

	/** CORS configuration */
	cors?: {
		/** Allowed origins (default: *) */
		origin?: string | string[] | boolean
		/** Allow credentials (default: true) */
		credentials?: boolean
		/** Allowed methods (default: GET, POST, PUT, PATCH, DELETE, OPTIONS) */
		methods?: string[]
		/** Allowed headers (default: Content-Type, Authorization) */
		headers?: string[]
		/** Exposed headers */
		exposedHeaders?: string[]
		/** Max age for preflight cache in seconds (default: 86400) */
		maxAge?: number
	}

	/** Database configuration */
	database?: {
		/** PostgreSQL connection URL. Falls back to DATABASE_URL env var */
		url?: string
		/** Max pool connections (default: 20) */
		maxConnections?: number
		/** Idle timeout in ms (default: 30000) */
		idleTimeout?: number
		/** Migrations configuration */
		migrations?: {
			/** Directory containing migration SQL files (default: migrations) */
			directory?: string
		}
	}

	/** Redis configuration (optional, falls back to Postgres) */
	redis?: {
		/** Redis connection URL. Falls back to REDIS_URL env var (default: redis://localhost:6379) */
		url?: string
		/** Connection timeout in milliseconds (default: 5000) */
		connectionTimeout?: number
		/** Idle timeout in milliseconds (default: 30000) */
		idleTimeout?: number
		/** Whether to automatically reconnect on disconnection (default: true) */
		autoReconnect?: boolean
		/** Maximum number of reconnection attempts (default: 10) */
		maxRetries?: number
		/** Enable TLS connections (default: false) */
		tls?: boolean
	}

	/** Auth configuration */
	auth?: {
		sessionSecret: string
		cookieName?: string
		expiresIn?: number
	}

	/** Persistence configuration */
	persistence?: {
		enabled?: boolean
		flushIntervalMs?: number
		maxBufferSize?: number
	}

	/** File storage configuration */
	storage?: {
		/** Storage adapter (default: local) */
		adapter?: 'local' | 's3'
		/** Local filesystem storage options */
		local?: {
			/** Base directory for file storage (default: .storage) */
			directory?: string
		}
		/** S3-compatible storage options */
		s3?: {
			bucket: string
			region?: string
			endpoint?: string
			accessKeyId: string
			secretAccessKey: string
		}
	}

	/** Email mailer configuration */
	mailer?: {
		/** Mailer provider (default: smtp) */
		provider?: 'smtp' | 'resend' | 'sendgrid' | 'mailgun' | 'ses'
		/** Default sender information */
		from: {
			name: string
			email: string
		}
		/** SMTP configuration */
		smtp?: {
			host: string
			port: number
			secure?: boolean
			auth: {
				user: string
				pass: string
			}
		}
		/** Resend configuration */
		resend?: {
			apiKey: string
		}
		/** SendGrid configuration */
		sendgrid?: {
			apiKey: string
		}
		/** Mailgun configuration */
		mailgun?: {
			apiKey: string
			domain: string
		}
		/** AWS SES configuration */
		ses?: {
			region: string
			accessKeyId: string
			secretAccessKey: string
		}
	}

	/** Enable SaaS features (Organizations, Billing) */
	saas?: boolean

	/** Enable MCP Server */
	mcp?: boolean

	/** OpenAPI configuration */
	openapi?: {
		enabled: boolean
		path?: string
		title?: string
		version?: string
	}

	/** Studio configuration */
	studio?: {
		/** Enable studio dashboard */
		enabled?: boolean
		/** Studio mount path (default: /_studio) */
		path?: string
		/** Studio API prefix (default: /_studio/api) */
		apiPrefix?: string
	}
}

/**
 * Helper to define type-safe configuration.
 */
export function defineConfig(config: BunbaseConfig): BunbaseConfig {
	return config
}
