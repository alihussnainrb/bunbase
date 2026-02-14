import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { OTLPLogExporter } from '../../../packages/bunbase/src/observability/otlp-log-exporter.ts'

describe('OTLPLogExporter', () => {
	let exporter: OTLPLogExporter

	// Mock fetch globally
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof mock>

	beforeEach(() => {
		fetchMock = mock(() =>
			Promise.resolve(new Response('', { status: 200 })),
		)
		globalThis.fetch = fetchMock as any

		// Use long interval to prevent automatic flushes during tests
		exporter = new OTLPLogExporter({
			endpoint: 'http://localhost:4318/v1/logs',
			batchSize: 3,
			exportIntervalMs: 10000, // 10 seconds (long enough for tests)
			serviceName: 'test-service',
		})
	})

	afterEach(async () => {
		await exporter.stop()
		globalThis.fetch = originalFetch
	})

	describe('createListener', () => {
		test('creates a log listener that buffers logs', () => {
			const listener = exporter.createListener()

			listener('INFO', 'Test message 1', { userId: '123' })
			listener('ERROR', 'Test message 2', { error: 'Something failed' })

			expect(exporter.getBufferSize()).toBe(2)
		})

		test('converts log levels to OTLP severity numbers', async () => {
			// Create exporter with large batch size to avoid auto-flush
			const testExporter = new OTLPLogExporter({
				batchSize: 10,
				exportIntervalMs: 10000,
			})

			const listener = testExporter.createListener()

			listener('DEBUG', 'Debug message', {})
			listener('INFO', 'Info message', {})
			listener('WARNING', 'Warning message', {})
			listener('ERROR', 'Error message', {})
			listener('CRITICAL', 'Critical message', {})

			// Force flush
			await testExporter.flush()

			expect(fetchMock).toHaveBeenCalledTimes(1)
			const payload = JSON.parse(fetchMock.mock.calls[0][1].body)

			const logRecords = payload.resourceLogs[0].scopeLogs[0].logRecords
			expect(logRecords[0].severityNumber).toBe(5) // DEBUG
			expect(logRecords[1].severityNumber).toBe(9) // INFO
			expect(logRecords[2].severityNumber).toBe(13) // WARNING
			expect(logRecords[3].severityNumber).toBe(17) // ERROR
			expect(logRecords[4].severityNumber).toBe(21) // CRITICAL

			await testExporter.stop()
		})

		test('includes trace context when enabled', async () => {
			const listener = exporter.createListener()

			listener('INFO', 'Message with trace', {
				trace_id: 'abc123',
				span_id: 'def456',
				userId: '789',
			})

			await exporter.flush()

			const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
			const logRecord = payload.resourceLogs[0].scopeLogs[0].logRecords[0]

			expect(logRecord.traceId).toBe('abc123')
			expect(logRecord.spanId).toBe('def456')
			expect(logRecord.attributes).toBeDefined()
			expect(
				logRecord.attributes.find((attr: any) => attr.key === 'userId')?.value
					.stringValue,
			).toBe('789')
		})

		test('excludes trace context when disabled', async () => {
			const exporterNoTrace = new OTLPLogExporter({
				includeTraceContext: false,
				batchSize: 1,
				exportIntervalMs: 1000,
			})

			const listener = exporterNoTrace.createListener()

			listener('INFO', 'Message without trace', {
				trace_id: 'abc123',
				span_id: 'def456',
			})

			await exporterNoTrace.flush()

			const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
			const logRecord = payload.resourceLogs[0].scopeLogs[0].logRecords[0]

			expect(logRecord.traceId).toBeUndefined()
			expect(logRecord.spanId).toBeUndefined()

			await exporterNoTrace.stop()
		})

		test('converts attribute types correctly', async () => {
			const listener = exporter.createListener()

			listener('INFO', 'Message with various types', {
				stringAttr: 'hello',
				numberAttr: 42,
				boolAttr: true,
				objectAttr: { nested: 'value' },
			})

			await exporter.flush()

			const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
			const attributes = payload.resourceLogs[0].scopeLogs[0].logRecords[0]
				.attributes

			expect(
				attributes.find((attr: any) => attr.key === 'stringAttr')?.value
					.stringValue,
			).toBe('hello')
			expect(
				attributes.find((attr: any) => attr.key === 'numberAttr')?.value
					.intValue,
			).toBe('42')
			expect(
				attributes.find((attr: any) => attr.key === 'boolAttr')?.value
					.boolValue,
			).toBe(true)
			expect(
				attributes.find((attr: any) => attr.key === 'objectAttr')?.value
					.stringValue,
			).toBe('{"nested":"value"}')
		})
	})

	describe('Batching', () => {
		test('flushes automatically when batch size reached', async () => {
			const listener = exporter.createListener()

			listener('INFO', 'Message 1', {})
			listener('INFO', 'Message 2', {})
			expect(exporter.getBufferSize()).toBe(2)

			listener('INFO', 'Message 3', {}) // Should trigger flush
			expect(exporter.getBufferSize()).toBe(0)

			// Wait a bit for async flush
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(fetchMock).toHaveBeenCalledTimes(1)
		})

		test('flushes periodically based on interval', async () => {
			// Create exporter with short interval for this test
			const testExporter = new OTLPLogExporter({
				batchSize: 10, // Large to avoid batch flush
				exportIntervalMs: 100, // Short interval
			})

			const listener = testExporter.createListener()

			listener('INFO', 'Message 1', {})
			expect(testExporter.getBufferSize()).toBe(1)

			// Wait for interval to trigger flush (100ms)
			await new Promise((resolve) => setTimeout(resolve, 150))

			expect(testExporter.getBufferSize()).toBe(0)
			expect(fetchMock).toHaveBeenCalled()

			await testExporter.stop()
		})

		test('flush() sends correct OTLP payload structure', async () => {
			const listener = exporter.createListener()

			listener('INFO', 'Test message', { userId: '123' })
			await exporter.flush()

			expect(fetchMock).toHaveBeenCalledTimes(1)

			const [url, options] = fetchMock.mock.calls[0]
			expect(url).toBe('http://localhost:4318/v1/logs')
			expect(options.method).toBe('POST')
			expect(options.headers['Content-Type']).toBe('application/json')

			const payload = JSON.parse(options.body)

			// Check structure
			expect(payload.resourceLogs).toBeDefined()
			expect(payload.resourceLogs[0].resource.attributes).toBeDefined()
			expect(payload.resourceLogs[0].scopeLogs).toBeDefined()
			expect(payload.resourceLogs[0].scopeLogs[0].logRecords).toBeDefined()

			// Check resource attributes
			const serviceNameAttr = payload.resourceLogs[0].resource.attributes.find(
				(attr: any) => attr.key === 'service.name',
			)
			expect(serviceNameAttr?.value.stringValue).toBe('test-service')

			// Check scope
			expect(payload.resourceLogs[0].scopeLogs[0].scope.name).toBe(
				'bunbase-logger',
			)

			// Check log record
			const logRecord = payload.resourceLogs[0].scopeLogs[0].logRecords[0]
			expect(logRecord.body.stringValue).toBe('Test message')
			expect(logRecord.severityNumber).toBe(9) // INFO
			expect(logRecord.severityText).toBe('INFO')
		})
	})

	describe('Error Handling', () => {
		test('handles fetch errors gracefully', async () => {
			// Suppress console.error for this test
			const originalConsoleError = console.error
			console.error = () => {}

			// Mock fetch to fail
			globalThis.fetch = mock(() =>
				Promise.reject(new Error('Network error')),
			) as any

			const listener = exporter.createListener()
			listener('ERROR', 'Test error message', {})

			// Should not throw
			await expect(exporter.flush()).resolves.toBeUndefined()

			// Restore console.error
			console.error = originalConsoleError
		})

		test('handles non-200 responses', async () => {
			// Suppress console.error for this test
			const originalConsoleError = console.error
			console.error = () => {}

			// Mock fetch to return error
			globalThis.fetch = mock(() =>
				Promise.resolve(
					new Response('Bad Request', { status: 400 }),
				),
			) as any

			const listener = exporter.createListener()
			listener('INFO', 'Test message', {})

			// Should not throw
			await expect(exporter.flush()).resolves.toBeUndefined()

			// Restore console.error
			console.error = originalConsoleError
		})
	})

	describe('stop()', () => {
		test('stops periodic flushing and flushes remaining logs', async () => {
			const listener = exporter.createListener()

			listener('INFO', 'Message 1', {})
			listener('INFO', 'Message 2', {})

			expect(exporter.getBufferSize()).toBe(2)

			await exporter.stop()

			// Should have flushed
			expect(exporter.getBufferSize()).toBe(0)
			expect(fetchMock).toHaveBeenCalled()
		})
	})

	describe('Configuration', () => {
		test('uses default endpoint if not specified', async () => {
			const defaultExporter = new OTLPLogExporter()
			const listener = defaultExporter.createListener()

			listener('INFO', 'Test', {})
			await defaultExporter.flush()

			expect(fetchMock).toHaveBeenCalledWith(
				'http://localhost:4318/v1/logs',
				expect.anything(),
			)

			await defaultExporter.stop()
		})

		test('includes custom headers in requests', async () => {
			const exporterWithHeaders = new OTLPLogExporter({
				headers: {
					Authorization: 'Bearer token123',
					'X-Custom-Header': 'custom-value',
				},
				batchSize: 1,
			})

			const listener = exporterWithHeaders.createListener()
			listener('INFO', 'Test', {})

			await exporterWithHeaders.flush()

			const [, options] = fetchMock.mock.calls[0]
			expect(options.headers.Authorization).toBe('Bearer token123')
			expect(options.headers['X-Custom-Header']).toBe('custom-value')

			await exporterWithHeaders.stop()
		})
	})
})
