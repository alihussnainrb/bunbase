/**
 * Observability types for metrics collection and Prometheus export.
 */

/** Metric label key-value pairs */
export type Labels = Record<string, string | number>

/** Counter metric - monotonically increasing value */
export interface Counter {
	name: string
	help: string
	labels: Labels
	value: number
}

/** Histogram metric - distribution of values in buckets */
export interface Histogram {
	name: string
	help: string
	labels: Labels
	buckets: Map<number, number> // bucket upper bound -> count
	sum: number
	count: number
}

/** Gauge metric - arbitrary value that can go up or down */
export interface Gauge {
	name: string
	help: string
	labels: Labels
	value: number
}

/** Histogram bucket configuration */
export interface HistogramBuckets {
	/** Bucket upper bounds in milliseconds (default: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]) */
	latency?: number[]
}

/** Metric type enum */
export enum MetricType {
	Counter = 'counter',
	Histogram = 'histogram',
	Gauge = 'gauge',
}

/** Serialized metric key for storage */
export type MetricKey = string

/** Options for incrementing a counter */
export interface IncrementOptions {
	labels?: Labels
	value?: number
}

/** Options for observing a histogram value */
export interface ObserveOptions {
	labels?: Labels
}

/** Options for setting a gauge value */
export interface SetGaugeOptions {
	labels?: Labels
}

/** Prometheus text format output */
export interface PrometheusOutput {
	contentType: 'text/plain; version=0.0.4; charset=utf-8'
	body: string
}
