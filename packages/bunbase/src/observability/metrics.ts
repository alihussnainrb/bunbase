/**
 * MetricsCollector - Prometheus-compatible metrics collection
 *
 * Collects counters, histograms, and gauges for observability.
 * Exports metrics in Prometheus text format.
 */

import type {
	Counter,
	Gauge,
	Histogram,
	IncrementOptions,
	Labels,
	MetricKey,
	ObserveOptions,
	PrometheusOutput,
	SetGaugeOptions,
} from './types'
import { MetricType } from './types'

const DEFAULT_LATENCY_BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

export class MetricsCollector {
	private counters: Map<MetricKey, Counter> = new Map()
	private histograms: Map<MetricKey, Histogram> = new Map()
	private gauges: Map<MetricKey, Gauge> = new Map()

	private latencyBuckets: number[]
	private includeDefaultMetrics: boolean
	private startTime: number

	constructor(options?: {
		latencyBuckets?: number[]
		includeDefaultMetrics?: boolean
	}) {
		this.latencyBuckets = options?.latencyBuckets ?? DEFAULT_LATENCY_BUCKETS
		this.includeDefaultMetrics = options?.includeDefaultMetrics ?? true
		this.startTime = Date.now()
	}

	/**
	 * Increment a counter metric
	 */
	incrementCounter(
		name: string,
		help: string,
		options: IncrementOptions = {},
	): void {
		const { labels = {}, value = 1 } = options
		const key = this.makeKey(name, labels)

		const existing = this.counters.get(key)
		if (existing) {
			existing.value += value
		} else {
			this.counters.set(key, { name, help, labels, value })
		}
	}

	/**
	 * Observe a value in a histogram metric
	 */
	observeHistogram(
		name: string,
		help: string,
		value: number,
		options: ObserveOptions = {},
	): void {
		const { labels = {} } = options
		const key = this.makeKey(name, labels)

		let histogram = this.histograms.get(key)
		if (!histogram) {
			histogram = {
				name,
				help,
				labels,
				buckets: new Map(),
				sum: 0,
				count: 0,
			}

			// Initialize buckets
			for (const bucket of this.latencyBuckets) {
				histogram.buckets.set(bucket, 0)
			}
			histogram.buckets.set(Number.POSITIVE_INFINITY, 0) // +Inf bucket

			this.histograms.set(key, histogram)
		}

		// Update histogram
		histogram.sum += value
		histogram.count += 1

		// Increment buckets
		for (const [bucket, count] of histogram.buckets) {
			if (value <= bucket) {
				histogram.buckets.set(bucket, count + 1)
			}
		}
	}

	/**
	 * Set a gauge metric to a specific value
	 */
	setGauge(
		name: string,
		help: string,
		value: number,
		options: SetGaugeOptions = {},
	): void {
		const { labels = {} } = options
		const key = this.makeKey(name, labels)

		this.gauges.set(key, { name, help, labels, value })
	}

	/**
	 * Increment a gauge metric
	 */
	incrementGauge(
		name: string,
		help: string,
		delta: number = 1,
		options: SetGaugeOptions = {},
	): void {
		const { labels = {} } = options
		const key = this.makeKey(name, labels)

		const existing = this.gauges.get(key)
		if (existing) {
			existing.value += delta
		} else {
			this.gauges.set(key, { name, help, labels, value: delta })
		}
	}

	/**
	 * Decrement a gauge metric
	 */
	decrementGauge(
		name: string,
		help: string,
		delta: number = 1,
		options: SetGaugeOptions = {},
	): void {
		this.incrementGauge(name, help, -delta, options)
	}

	/**
	 * Export metrics in Prometheus text format
	 */
	export(): PrometheusOutput {
		let output = ''

		// Export counters
		const countersByName = this.groupByName(this.counters)
		for (const [name, metrics] of countersByName) {
			const help = metrics[0]?.help ?? 'Counter metric'
			output += `# HELP ${name} ${help}\n`
			output += `# TYPE ${name} counter\n`

			for (const metric of metrics) {
				const labelsStr = this.formatLabels(metric.labels)
				output += `${name}${labelsStr} ${metric.value}\n`
			}
			output += '\n'
		}

		// Export histograms
		const histogramsByName = this.groupByName(this.histograms)
		for (const [name, metrics] of histogramsByName) {
			const help = metrics[0]?.help ?? 'Histogram metric'
			output += `# HELP ${name} ${help}\n`
			output += `# TYPE ${name} histogram\n`

			for (const metric of metrics) {
				const labelsStr = this.formatLabels(metric.labels)

				// Bucket counts
				for (const [bucket, count] of metric.buckets) {
					const le = bucket === Number.POSITIVE_INFINITY ? '+Inf' : bucket
					const bucketLabels = { ...metric.labels, le }
					const bucketLabelsStr = this.formatLabels(bucketLabels)
					output += `${name}_bucket${bucketLabelsStr} ${count}\n`
				}

				// Sum and count
				output += `${name}_sum${labelsStr} ${metric.sum}\n`
				output += `${name}_count${labelsStr} ${metric.count}\n`
			}
			output += '\n'
		}

		// Export gauges
		const gaugesByName = this.groupByName(this.gauges)
		for (const [name, metrics] of gaugesByName) {
			const help = metrics[0]?.help ?? 'Gauge metric'
			output += `# HELP ${name} ${help}\n`
			output += `# TYPE ${name} gauge\n`

			for (const metric of metrics) {
				const labelsStr = this.formatLabels(metric.labels)
				output += `${name}${labelsStr} ${metric.value}\n`
			}
			output += '\n'
		}

		// Include default metrics if enabled
		if (this.includeDefaultMetrics) {
			output += this.exportDefaultMetrics()
		}

		return {
			contentType: 'text/plain; version=0.0.4; charset=utf-8',
			body: output,
		}
	}

	/**
	 * Reset all metrics (useful for testing)
	 */
	reset(): void {
		this.counters.clear()
		this.histograms.clear()
		this.gauges.clear()
	}

	/**
	 * Get metric counts (useful for debugging)
	 */
	getMetricCounts(): {
		counters: number
		histograms: number
		gauges: number
	} {
		return {
			counters: this.counters.size,
			histograms: this.histograms.size,
			gauges: this.gauges.size,
		}
	}

	/**
	 * Make a unique key for a metric based on name and labels
	 */
	private makeKey(name: string, labels: Labels): MetricKey {
		const sortedLabels = Object.keys(labels)
			.sort()
			.map((key) => `${key}=${labels[key]}`)
			.join(',')
		return sortedLabels ? `${name}{${sortedLabels}}` : name
	}

	/**
	 * Format labels for Prometheus output
	 */
	private formatLabels(labels: Labels): string {
		if (Object.keys(labels).length === 0) {
			return ''
		}

		const formatted = Object.entries(labels)
			.map(([key, value]) => {
				// Sanitize label key (Prometheus naming rules)
				const sanitizedKey = this.sanitizeLabelKey(key)
				// Escape label value
				const escapedValue = this.escapeLabelValue(String(value))
				return `${sanitizedKey}="${escapedValue}"`
			})
			.join(',')

		return `{${formatted}}`
	}

	/**
	 * Sanitize label key to follow Prometheus naming rules
	 * Label names must match: [a-zA-Z_][a-zA-Z0-9_]*
	 */
	private sanitizeLabelKey(key: string): string {
		// Replace invalid characters with underscores
		let sanitized = key.replace(/[^a-zA-Z0-9_]/g, '_')
		// Ensure it starts with a letter or underscore
		if (!/^[a-zA-Z_]/.test(sanitized)) {
			sanitized = `_${sanitized}`
		}
		return sanitized
	}

	/**
	 * Escape label value for Prometheus format
	 */
	private escapeLabelValue(value: string): string {
		return value
			.replace(/\\/g, '\\\\') // Backslash
			.replace(/"/g, '\\"') // Double quote
			.replace(/\n/g, '\\n') // Newline
	}

	/**
	 * Group metrics by name for output
	 */
	private groupByName<T extends { name: string }>(
		metrics: Map<MetricKey, T>,
	): Map<string, T[]> {
		const grouped = new Map<string, T[]>()

		for (const metric of metrics.values()) {
			const existing = grouped.get(metric.name)
			if (existing) {
				existing.push(metric)
			} else {
				grouped.set(metric.name, [metric])
			}
		}

		return grouped
	}

	/**
	 * Export default Node.js/Bun metrics
	 */
	private exportDefaultMetrics(): string {
		let output = ''

		// Bunbase uptime
		const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000)
		output += '# HELP bunbase_uptime_seconds Bunbase server uptime in seconds\n'
		output += '# TYPE bunbase_uptime_seconds gauge\n'
		output += `bunbase_uptime_seconds ${uptimeSeconds}\n\n`

		// Memory usage
		const memUsage = process.memoryUsage()
		output += '# HELP process_memory_bytes Process memory usage in bytes\n'
		output += '# TYPE process_memory_bytes gauge\n'
		output += `process_memory_bytes{type="rss"} ${memUsage.rss}\n`
		output += `process_memory_bytes{type="heap_total"} ${memUsage.heapTotal}\n`
		output += `process_memory_bytes{type="heap_used"} ${memUsage.heapUsed}\n`
		output += `process_memory_bytes{type="external"} ${memUsage.external}\n\n`

		// CPU usage (if available)
		const cpuUsage = process.cpuUsage()
		output += '# HELP process_cpu_seconds_total Process CPU time in seconds\n'
		output += '# TYPE process_cpu_seconds_total counter\n'
		output += `process_cpu_seconds_total{type="user"} ${cpuUsage.user / 1_000_000}\n`
		output += `process_cpu_seconds_total{type="system"} ${cpuUsage.system / 1_000_000}\n\n`

		return output
	}
}

/**
 * Global singleton instance
 */
let globalMetrics: MetricsCollector | null = null

/**
 * Get or create the global metrics collector
 */
export function getMetricsCollector(options?: {
	latencyBuckets?: number[]
	includeDefaultMetrics?: boolean
}): MetricsCollector {
	if (!globalMetrics) {
		globalMetrics = new MetricsCollector(options)
	}
	return globalMetrics
}

/**
 * Reset the global metrics collector (useful for testing)
 */
export function resetMetricsCollector(): void {
	globalMetrics = null
}
