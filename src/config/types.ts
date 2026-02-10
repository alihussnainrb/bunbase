export interface BunbaseConfig {
    /** HTTP server port (default: 3000) */
    port?: number
    /** HTTP server host (default: 0.0.0.0) */
    hostname?: string

    /** Directory to scan for actions and modules (default: src/actions) */
    actionsDir?: string

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

    /** Enable SaaS features (Organizations, Billing) */
    saas?: boolean

    /** Enable MCP Server */
    mcp?: boolean
}

/**
 * Helper to define type-safe configuration.
 */
export function defineConfig(config: BunbaseConfig): BunbaseConfig {
    return config
}
