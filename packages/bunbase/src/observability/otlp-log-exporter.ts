/**
 * OTLP Log Exporter - OpenTelemetry Protocol log export
 *
 * Exports logs to OTLP-compatible collectors (Jaeger, Tempo, etc.)
 * Uses OTLP/HTTP JSON format for broad compatibility
 */

import type { LogListener } from '../logger/logger'

/**
 * OTLP severity mapping
 * See: https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
const SEVERITY_MAP: Record<string, { number: number; text: string }> = {
	DEBUG: { number: 5, text: 'DEBUG' },
	INFO: { number: 9, text: 'INFO' },
	WARNING: { number: 13, text: 'WARN' },
	ERROR: { number: 17, text: 'ERROR' },
	CRITICAL: { number: 21, text: 'FATAL' },
}

const DEFAULT_SEVERITY = { number: 9, text: 'INFO' }

interface OTLPLogRecord {
	timeUnixNano: string
	severityNumber: number
	severityText: string
	body: {
		stringValue: string
	}
	attributes?: Array<{
		key: string
		value: { stringValue?: string; intValue?: string; boolValue?: boolean }
	}>
	traceId?: string
	spanId?: string
}

interface OTLPLogsPayload {
	resourceLogs: Array<{
		resource: {
			attributes: Array<{
				key: string
				value: { stringValue: string }
			}>
		}
		scopeLogs: Array<{
			scope: {
				name: string
				version?: string
			}
			logRecords: OTLPLogRecord[]
		}>
	}>
}

export interface OTLPLogExporterConfig {
	/** OTLP collector endpoint (default: http://localhost:4318/v1/logs) */
	endpoint?: string
	/** HTTP headers for authentication */
	headers?: Record<string, string>
	/** Batch size before forcing flush (default: 100) */
	batchSize?: number
	/** Export interval in milliseconds (default: 5000) */
	exportIntervalMs?: number
	/** Service name for resource attributes (default: 'bunbase') */
	serviceName?: string
	/** Include trace context (trace_id, span_id) in attributes */
	includeTraceContext?: boolean
}

export class OTLPLogExporter {
	private buffer: OTLPLogRecord[] = []
	private flushTimer: Timer | null = null
	private readonly config: Required<OTLPLogExporterConfig>

	constructor(config: OTLPLogExporterConfig = {}) {
		this.config = {
			endpoint: config.endpoint ?? 'http://localhost:4318/v1/logs',
			headers: config.headers ?? {},
			batchSize: config.batchSize ?? 100,
			exportIntervalMs: config.exportIntervalMs ?? 5000,
			serviceName: config.serviceName ?? 'bunbase',
			includeTraceContext: config.includeTraceContext ?? true,
		}

		// Start periodic flush
		this.startFlushTimer()
	}

	/**
	 * Create a LogListener that exports to OTLP
	 */
	public createListener(): LogListener {
		return (level, msg, args) => {
			// Safely get severity with fallback to INFO
			const severity = SEVERITY_MAP[level] ?? DEFAULT_SEVERITY

			// Convert nanoseconds (OTLP requires nanosecond precision)
			const timeUnixNano = (Date.now() * 1_000_000).toString()

			const logRecord: OTLPLogRecord = {
				timeUnixNano,
				severityNumber: severity.number,
				severityText: severity.text,
				body: {
					stringValue: msg,
				},
			}

			// Add attributes from args
			if (args && typeof args === 'object') {
				const attributes: OTLPLogRecord['attributes'] = []

				for (const [key, value] of Object.entries(args)) {
					// Skip trace context if includeTraceContext is false
					if (
						!this.config.includeTraceContext &&
						(key === 'trace_id' || key === 'span_id')
					) {
						continue
					}

					// Map trace_id and span_id to OTLP fields
					if (key === 'trace_id' && this.config.includeTraceContext) {
						logRecord.traceId = String(value)
						continue
					}
					if (key === 'span_id' && this.config.includeTraceContext) {
						logRecord.spanId = String(value)
						continue
					}

					// Add other attributes
					if (typeof value === 'string') {
						attributes.push({ key, value: { stringValue: value } })
					} else if (typeof value === 'number') {
						attributes.push({ key, value: { intValue: String(value) } })
					} else if (typeof value === 'boolean') {
						attributes.push({ key, value: { boolValue: value } })
					} else {
						// Serialize complex objects as JSON strings
						attributes.push({
							key,
							value: { stringValue: JSON.stringify(value) },
						})
					}
				}

				if (attributes.length > 0) {
					logRecord.attributes = attributes
				}
			}

			this.buffer.push(logRecord)

			// Flush if batch size reached
			if (this.buffer.length >= this.config.batchSize) {
				this.flush()
			}
		}
	}

	/**
	 * Start periodic flush timer
	 */
	private startFlushTimer(): void {
		this.flushTimer = setInterval(() => {
			if (this.buffer.length > 0) {
				this.flush()
			}
		}, this.config.exportIntervalMs)
	}

	/**
	 * Flush buffered logs to OTLP endpoint
	 */
	public async flush(): Promise<void> {
		if (this.buffer.length === 0) return

		// Take current buffer and reset
		const logsToExport = this.buffer.splice(0, this.buffer.length)

		// Build OTLP payload
		const payload: OTLPLogsPayload = {
			resourceLogs: [
				{
					resource: {
						attributes: [
							{
								key: 'service.name',
								value: { stringValue: this.config.serviceName },
							},
						],
					},
					scopeLogs: [
						{
							scope: {
								name: 'bunbase-logger',
								version: '1.0.0',
							},
							logRecords: logsToExport,
						},
					],
				},
			],
		}

		try {
			const response = await fetch(this.config.endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...this.config.headers,
				},
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				const error = await response.text()
				console.error(
					`[OTLP] Failed to export logs: ${response.status} ${error}`,
				)
			}
		} catch (error) {
			console.error('[OTLP] Failed to export logs:', error)
			// Re-add logs to buffer for retry (optional behavior)
			// this.buffer.unshift(...logsToExport)
		}
	}

	/**
	 * Stop exporter and flush remaining logs
	 */
	public async stop(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer)
			this.flushTimer = null
		}

		// Final flush
		await this.flush()
	}

	/**
	 * Get current buffer size
	 */
	public getBufferSize(): number {
		return this.buffer.length
	}
}

/**
 * Global singleton instance
 */
let globalOTLPExporter: OTLPLogExporter | null = null

/**
 * Get or create the global OTLP log exporter
 */
export function getOTLPLogExporter(
	config?: OTLPLogExporterConfig,
): OTLPLogExporter {
	if (!globalOTLPExporter) {
		globalOTLPExporter = new OTLPLogExporter(config)
	}
	return globalOTLPExporter
}

/**
 * Reset the global OTLP log exporter (useful for testing)
 */
export function resetOTLPLogExporter(): void {
	if (globalOTLPExporter) {
		globalOTLPExporter.stop()
		globalOTLPExporter = null
	}
}
