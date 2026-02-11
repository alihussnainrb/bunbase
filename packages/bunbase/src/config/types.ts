export interface BunbaseConfig {
	/** HTTP server port (default: 3000) */
	port?: number
	/** HTTP server host (default: 0.0.0.0) */
	hostname?: string

	/** Directory to scan for actions and modules (default: src/actions) */
	actionsDir?: string

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
