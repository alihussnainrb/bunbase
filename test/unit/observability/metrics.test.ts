import { describe, expect, test, beforeEach } from 'bun:test'
import { MetricsCollector } from '../../../packages/bunbase/src/observability/metrics.ts'

describe('MetricsCollector', () => {
	let metrics: MetricsCollector

	beforeEach(() => {
		metrics = new MetricsCollector({
			latencyBuckets: [10, 50, 100, 500, 1000],
			includeDefaultMetrics: false, // Disable for predictable tests
		})
	})

	describe('Counter', () => {
		test('increments counter without labels', () => {
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests')
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests')
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests')

			const output = metrics.export()
			expect(output.body).toContain('# HELP http_requests_total Total HTTP requests')
			expect(output.body).toContain('# TYPE http_requests_total counter')
			expect(output.body).toContain('http_requests_total 3')
		})

		test('increments counter with labels', () => {
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests', {
				labels: { method: 'POST', status: 200 },
			})
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests', {
				labels: { method: 'POST', status: 200 },
				value: 2,
			})
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests', {
				labels: { method: 'GET', status: 200 },
			})

			const output = metrics.export()
			expect(output.body).toContain('http_requests_total{method="POST",status="200"} 3')
			expect(output.body).toContain('http_requests_total{method="GET",status="200"} 1')
		})

		test('handles custom increment values', () => {
			metrics.incrementCounter('bytes_sent', 'Total bytes sent', { value: 1024 })
			metrics.incrementCounter('bytes_sent', 'Total bytes sent', { value: 2048 })

			const output = metrics.export()
			expect(output.body).toContain('bytes_sent 3072')
		})
	})

	describe('Histogram', () => {
		test('observes histogram values', () => {
			metrics.observeHistogram('http_request_duration_ms', 'HTTP request duration', 25)
			metrics.observeHistogram('http_request_duration_ms', 'HTTP request duration', 75)
			metrics.observeHistogram('http_request_duration_ms', 'HTTP request duration', 150)
			metrics.observeHistogram('http_request_duration_ms', 'HTTP request duration', 600)

			const output = metrics.export()
			expect(output.body).toContain('# HELP http_request_duration_ms HTTP request duration')
			expect(output.body).toContain('# TYPE http_request_duration_ms histogram')

			// Check buckets (values: 25, 75, 150, 600)
			// Buckets: [10, 50, 100, 500, 1000, +Inf]
			expect(output.body).toContain('http_request_duration_ms_bucket{le="10"} 0')
			expect(output.body).toContain('http_request_duration_ms_bucket{le="50"} 1') // 25
			expect(output.body).toContain('http_request_duration_ms_bucket{le="100"} 2') // 25, 75
			expect(output.body).toContain('http_request_duration_ms_bucket{le="500"} 3') // 25, 75, 150
			expect(output.body).toContain('http_request_duration_ms_bucket{le="1000"} 4') // all
			expect(output.body).toContain('http_request_duration_ms_bucket{le="+Inf"} 4')

			// Check sum and count
			expect(output.body).toContain('http_request_duration_ms_sum 850')
			expect(output.body).toContain('http_request_duration_ms_count 4')
		})

		test('observes histogram with labels', () => {
			metrics.observeHistogram('action_duration_ms', 'Action duration', 45, {
				labels: { action: 'login', status: 'success' },
			})
			metrics.observeHistogram('action_duration_ms', 'Action duration', 120, {
				labels: { action: 'login', status: 'success' },
			})
			metrics.observeHistogram('action_duration_ms', 'Action duration', 30, {
				labels: { action: 'signup', status: 'success' },
			})

			const output = metrics.export()
			expect(output.body).toContain('action_duration_ms_bucket{action="login",status="success",le="50"} 1')
			expect(output.body).toContain('action_duration_ms_bucket{action="login",status="success",le="500"} 2')
			expect(output.body).toContain('action_duration_ms_sum{action="login",status="success"} 165')
			expect(output.body).toContain('action_duration_ms_count{action="login",status="success"} 2')

			expect(output.body).toContain('action_duration_ms_bucket{action="signup",status="success",le="50"} 1')
			expect(output.body).toContain('action_duration_ms_sum{action="signup",status="success"} 30')
			expect(output.body).toContain('action_duration_ms_count{action="signup",status="success"} 1')
		})
	})

	describe('Gauge', () => {
		test('sets gauge value', () => {
			metrics.setGauge('active_connections', 'Active connections', 42)

			const output = metrics.export()
			expect(output.body).toContain('# HELP active_connections Active connections')
			expect(output.body).toContain('# TYPE active_connections gauge')
			expect(output.body).toContain('active_connections 42')
		})

		test('sets gauge with labels', () => {
			metrics.setGauge('queue_depth', 'Queue depth', 10, {
				labels: { priority: 'high' },
			})
			metrics.setGauge('queue_depth', 'Queue depth', 25, {
				labels: { priority: 'normal' },
			})
			metrics.setGauge('queue_depth', 'Queue depth', 50, {
				labels: { priority: 'low' },
			})

			const output = metrics.export()
			expect(output.body).toContain('queue_depth{priority="high"} 10')
			expect(output.body).toContain('queue_depth{priority="normal"} 25')
			expect(output.body).toContain('queue_depth{priority="low"} 50')
		})

		test('increments gauge', () => {
			metrics.setGauge('active_workers', 'Active workers', 5)
			metrics.incrementGauge('active_workers', 'Active workers', 3)
			metrics.incrementGauge('active_workers', 'Active workers', 2)

			const output = metrics.export()
			expect(output.body).toContain('active_workers 10')
		})

		test('decrements gauge', () => {
			metrics.setGauge('active_workers', 'Active workers', 10)
			metrics.decrementGauge('active_workers', 'Active workers', 3)
			metrics.decrementGauge('active_workers', 'Active workers', 2)

			const output = metrics.export()
			expect(output.body).toContain('active_workers 5')
		})
	})

	describe('Label sanitization', () => {
		test('sanitizes invalid label keys', () => {
			metrics.incrementCounter('test_metric', 'Test metric', {
				labels: { 'content-type': 'application/json', '123invalid': 'value' },
			})

			const output = metrics.export()
			// Hyphens replaced with underscores, numbers prefixed
			expect(output.body).toContain('content_type="application/json"')
			expect(output.body).toContain('_123invalid="value"')
		})

		test('escapes label values', () => {
			metrics.incrementCounter('test_metric', 'Test metric', {
				labels: { path: '/api/test"with\\quotes\nand\\newlines' },
			})

			const output = metrics.export()
			expect(output.body).toContain('path="/api/test\\"with\\\\quotes\\nand\\\\newlines"')
		})
	})

	describe('Content type', () => {
		test('returns correct Prometheus content type', () => {
			const output = metrics.export()
			expect(output.contentType).toBe('text/plain; version=0.0.4; charset=utf-8')
		})
	})

	describe('Reset', () => {
		test('resets all metrics', () => {
			metrics.incrementCounter('test_counter', 'Test counter')
			metrics.setGauge('test_gauge', 'Test gauge', 42)
			metrics.observeHistogram('test_histogram', 'Test histogram', 100)

			metrics.reset()

			const counts = metrics.getMetricCounts()
			expect(counts.counters).toBe(0)
			expect(counts.gauges).toBe(0)
			expect(counts.histograms).toBe(0)

			const output = metrics.export()
			expect(output.body).not.toContain('test_counter')
			expect(output.body).not.toContain('test_gauge')
			expect(output.body).not.toContain('test_histogram')
		})
	})

	describe('Default metrics', () => {
		test('includes default metrics when enabled', () => {
			const metricsWithDefaults = new MetricsCollector({
				includeDefaultMetrics: true,
			})

			const output = metricsWithDefaults.export()
			expect(output.body).toContain('process_uptime_seconds')
			expect(output.body).toContain('process_memory_bytes{type="rss"}')
			expect(output.body).toContain('process_memory_bytes{type="heap_total"}')
			expect(output.body).toContain('process_memory_bytes{type="heap_used"}')
			expect(output.body).toContain('process_cpu_seconds_total{type="user"}')
			expect(output.body).toContain('process_cpu_seconds_total{type="system"}')
		})

		test('excludes default metrics when disabled', () => {
			const output = metrics.export()
			expect(output.body).not.toContain('process_uptime_seconds')
			expect(output.body).not.toContain('process_memory_bytes')
			expect(output.body).not.toContain('process_cpu_seconds_total')
		})
	})

	describe('Multiple metrics', () => {
		test('exports multiple metrics of different types', () => {
			// Counter
			metrics.incrementCounter('http_requests_total', 'Total HTTP requests', {
				labels: { method: 'GET' },
			})

			// Histogram
			metrics.observeHistogram('http_duration_ms', 'HTTP duration', 125)

			// Gauge
			metrics.setGauge('active_connections', 'Active connections', 15)

			const output = metrics.export()

			// Verify all metrics are present
			expect(output.body).toContain('# TYPE http_requests_total counter')
			expect(output.body).toContain('http_requests_total{method="GET"} 1')

			expect(output.body).toContain('# TYPE http_duration_ms histogram')
			expect(output.body).toContain('http_duration_ms_count 1')

			expect(output.body).toContain('# TYPE active_connections gauge')
			expect(output.body).toContain('active_connections 15')
		})
	})
})
