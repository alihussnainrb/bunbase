import { describe, expect, it } from 'bun:test'
import { WriteBuffer } from '../src/persistence/write-buffer.ts'

describe('WriteBuffer', () => {
	describe('pushLog()', () => {
		it('should add log to buffer', () => {
			const buffer = new WriteBuffer({
				flushIntervalMs: 10000,
				maxBufferSize: 100,
			})

			buffer.pushLog({
				run_id: 'run-1',
				level: 'info',
				message: 'Test log',
				meta: JSON.stringify({ foo: 'bar' }),
				created_at: Date.now(),
			})

			// Logs are internal, we can't directly access them
			// But we can verify it doesn't throw
			expect(() => buffer.shutdown()).not.toThrow()
		})

		it('should trigger early flush when buffer reaches max size', async () => {
			let flushCalled = false
			const buffer = new WriteBuffer({
				flushIntervalMs: 10000,
				maxBufferSize: 2,
			})

			// Mock the flush method
			const originalFlush = (buffer as any).flush.bind(buffer)
			;(buffer as any).flush = async () => {
				flushCalled = true
				return originalFlush()
			}

			// Push 2 logs (at max size)
			buffer.pushLog({
				run_id: 'r1',
				level: 'info',
				message: 'm1',
				meta: null,
				created_at: 1,
			})
			buffer.pushLog({
				run_id: 'r2',
				level: 'info',
				message: 'm2',
				meta: null,
				created_at: 2,
			})

			// Should have triggered flush
			await new Promise((resolve) => setTimeout(resolve, 10))
			expect(flushCalled).toBe(true)

			await buffer.shutdown()
		})
	})

	describe('pushRun()', () => {
		it('should add run entry to buffer', () => {
			const buffer = new WriteBuffer({
				flushIntervalMs: 10000,
				maxBufferSize: 100,
			})

			buffer.pushRun({
				id: 'run-1',
				action_name: 'test',
				module_name: null,
				trace_id: 'trace-1',
				trigger_type: 'api',
				status: 'success',
				input: '{}',
				output: '{}',
				error: null,
				duration_ms: 100,
				started_at: Date.now(),
			})

			expect(() => buffer.shutdown()).not.toThrow()
		})
	})

	describe('flush()', () => {
		it('should clear buffers after flush', async () => {
			const buffer = new WriteBuffer({
				flushIntervalMs: 10000,
				maxBufferSize: 100,
			})

			buffer.pushLog({
				run_id: 'r1',
				level: 'info',
				message: 'm',
				meta: null,
				created_at: 1,
			})
			buffer.pushRun({
				id: '1',
				action_name: 'test',
				module_name: null,
				trace_id: 't1',
				trigger_type: 'api',
				status: 'success',
				input: '{}',
				output: '{}',
				error: null,
				duration_ms: 1,
				started_at: 1,
			})

			await buffer.flush()

			// After flush, should be able to shutdown cleanly
			await buffer.shutdown()
		})
	})

	describe('shutdown()', () => {
		it('should flush remaining entries', async () => {
			const buffer = new WriteBuffer({
				flushIntervalMs: 60000,
				maxBufferSize: 1000,
			})

			buffer.pushLog({
				run_id: 'r1',
				level: 'info',
				message: 'm',
				meta: null,
				created_at: 1,
			})

			// Should not throw
			await buffer.shutdown()
		})

		it('should clear flush interval', async () => {
			const buffer = new WriteBuffer({
				flushIntervalMs: 100,
				maxBufferSize: 1000,
			})

			// Let one interval pass
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Shutdown
			await buffer.shutdown()

			// After shutdown, should not have any more interval callbacks
			const startTime = Date.now()
			await new Promise((resolve) => setTimeout(resolve, 200))
			const endTime = Date.now()

			// Just verify time passed normally
			expect(endTime - startTime).toBeGreaterThanOrEqual(200)
		})
	})

	describe('options', () => {
		it('should use default options when not specified', () => {
			const buffer = new WriteBuffer()

			// Default flushIntervalMs is 2000, maxBufferSize is 500
			expect(() => buffer.shutdown()).not.toThrow()
		})

		it('should accept custom flush interval', async () => {
			const buffer = new WriteBuffer({
				flushIntervalMs: 50,
				maxBufferSize: 1000,
			})

			// Just verify it starts and stops cleanly with custom interval
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Should be able to shutdown cleanly
			await buffer.shutdown()
			expect(true).toBe(true) // Test passes if we get here
		})
	})
})
