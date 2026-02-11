import { describe, expect, it } from 'bun:test'
import { BunbaseServer } from '../src/runtime/server.ts'
import { ActionRegistry } from '../src/core/registry.ts'
import { WriteBuffer } from '../src/persistence/write-buffer.ts'
import { action } from '../src/core/action.ts'
import { module } from '../src/core/module.ts'
import { triggers } from '../src/triggers/index.ts'
import { guards } from '../src/guards/index.ts'
import { t } from '../src/index.ts'

// Mock logger
const createMockLogger = () => ({
	info: () => {},
	error: () => {},
	debug: () => {},
	child: () => createMockLogger(),
	session: () => ({
		success: () => {},
		error: () => {},
		end: () => {},
	}),
})

describe('Integration: Full Action Flow', () => {
	it('should handle API request through full pipeline', async () => {
		const registry = new ActionRegistry()
		const writeBuffer = new WriteBuffer({ flushIntervalMs: 10000, maxBufferSize: 100 })

		// Register a simple echo action
		const echoAction = action({
			name: 'echo',
			input: t.Object({ message: t.String() }),
			output: t.Object({ echoed: t.String() }),
			triggers: [triggers.api('POST', '/echo')],
		}, async (input) => {
			return { echoed: input.message }
		})

		registry.registerAction(echoAction)

		// Create server
		const server = new BunbaseServer(
			registry,
			createMockLogger() as any,
			writeBuffer,
		)

		// Start server
		const bunServer = server.start({ port: 0 }) // 0 = random port

		// Get the actual port
		const port = bunServer.port

		try {
			// Make a request
			const response = await fetch(`http://localhost:${port}/echo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: 'Hello World' }),
			})

			expect(response.status).toBe(200)

			const body = await response.json()
			expect(body.data).toEqual({ echoed: 'Hello World' })
		} finally {
			server.stop()
		}
	})

	it('should handle validation errors', async () => {
		const registry = new ActionRegistry()
		const writeBuffer = new WriteBuffer({ flushIntervalMs: 10000, maxBufferSize: 100 })

		// Register an action with validation
		const validatedAction = action({
			name: 'validated',
			input: t.Object({
				email: t.String({ format: 'email' }),
			}),
			output: t.Object({ success: t.Boolean() }),
			triggers: [triggers.api('POST', '/validated')],
		}, async () => {
			return { success: true }
		})

		registry.registerAction(validatedAction)

		const server = new BunbaseServer(
			registry,
			createMockLogger() as any,
			writeBuffer,
		)

		const bunServer = server.start({ port: 0 })
		const port = bunServer.port

		try {
			// Make a request with invalid email
			const response = await fetch(`http://localhost:${port}/validated`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'invalid-email' }),
			})

			expect(response.status).toBe(400) // Action validation error
		} finally {
			server.stop()
		}
	})

	it('should handle 404 for unknown routes', async () => {
		const registry = new ActionRegistry()
		const writeBuffer = new WriteBuffer({ flushIntervalMs: 10000, maxBufferSize: 100 })

		const server = new BunbaseServer(
			registry,
			createMockLogger() as any,
			writeBuffer,
		)

		const bunServer = server.start({ port: 0 })
		const port = bunServer.port

		try {
			const response = await fetch(`http://localhost:${port}/nonexistent`, {
				method: 'GET',
			})

			expect(response.status).toBe(404)
		} finally {
			server.stop()
		}
	})
})

describe('Integration: Module with Guards', () => {
	it('should apply module guards and API prefix', async () => {
		const registry = new ActionRegistry()
		const writeBuffer = new WriteBuffer({ flushIntervalMs: 10000, maxBufferSize: 100 })

		// Create a guarded module action
		const moduleAction = action({
			name: 'moduleTest',
			input: t.Object({}),
			output: t.Object({ message: t.String() }),
			triggers: [triggers.api('GET', '/test')],
		}, async () => {
			return { message: 'success' }
		})

		// Create module with guard and prefix
		const testModule = module({
			name: 'testModule',
			apiPrefix: '/api/v1',
			guards: [guards.authenticated()],
			actions: [moduleAction],
		})

		registry.registerModule(testModule)

		const server = new BunbaseServer(
			registry,
			createMockLogger() as any,
			writeBuffer,
		)

		const bunServer = server.start({ port: 0 })
		const port = bunServer.port

		try {
			// Request without auth should fail with 401
			const response = await fetch(`http://localhost:${port}/api/v1/test`, {
				method: 'GET',
			})

			expect(response.status).toBe(401)
		} finally {
			server.stop()
		}
	})
})

describe('Integration: Event Triggers', () => {
	it('should emit and handle events', async () => {
		const registry = new ActionRegistry()
		const writeBuffer = new WriteBuffer({ flushIntervalMs: 10000, maxBufferSize: 100 })

		let eventHandled = false

		// Register an event-triggered action
		const eventAction = action({
			name: 'eventHandler',
			input: t.Object({ data: t.String() }),
			output: t.Object({}),
			triggers: [triggers.event('test.event')],
		}, async (input) => {
			eventHandled = true
			expect(input.data).toBe('test-data')
			return {}
		})

		registry.registerAction(eventAction)

		const server = new BunbaseServer(
			registry,
			createMockLogger() as any,
			writeBuffer,
		)

		// Start server (this registers event listeners)
		const bunServer = server.start({ port: 0 })

		try {
			// Wait a bit for event listener registration
			await new Promise(resolve => setTimeout(resolve, 50))

			// Import event bus and emit
			const { eventBus } = await import('../src/runtime/event-bus.ts')
			eventBus.emit('test.event', { data: 'test-data' })

			// Wait for async event handling
			await new Promise(resolve => setTimeout(resolve, 100))

			expect(eventHandled).toBe(true)
		} finally {
			server.stop()
		}
	})
})
