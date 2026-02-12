export interface LogEntry {
	run_id: string
	level: string
	message: string
	meta: string | null
	created_at: number
}

export interface RunEntry {
	id: string
	action_name: string
	module_name: string | null
	trace_id: string
	trigger_type: string
	status: 'success' | 'error'
	input: string | null
	output: string | null
	error: string | null
	/** Full error stack trace for debugging (null for successful runs) */
	error_stack: string | null
	duration_ms: number
	started_at: number
	/** Which attempt this run entry represents (1-indexed). Null for actions without retry config. */
	attempt: number | null
	/** Total configured max attempts. Null for actions without retry config. */
	max_attempts: number | null
}

export interface WriteBufferOptions {
	/** Flush interval in milliseconds (default: 2000) */
	flushIntervalMs?: number
	/** Maximum buffer size before forcing a flush (default: 500) */
	maxBufferSize?: number
	/** Whether persistence is enabled (default: true) */
	enabled?: boolean
}
