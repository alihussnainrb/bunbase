export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export type LoggerOptions = {
	/** Minimum log level (default: 'info') */
	level?: LogLevel
	/** Show verbose output with metadata details (default: false) */
	verbose?: boolean
}
