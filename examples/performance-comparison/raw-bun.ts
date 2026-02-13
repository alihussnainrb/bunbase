/**
 * Raw Bun.serve with same overhead as Bunbase:
 * - TypeBox validation
 * - Logging infrastructure
 * - Session/cookie handling
 * - Persistence simulation
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Type } from 'typebox'
import { Value } from 'typebox/value'

// TypeBox schemas (same as Bunbase action)
const inputSchema = Type.Object({})
const outputSchema = Type.Object({
	message: Type.String(),
})

// Simple logger
class Logger {
	child(_meta: Record<string, any>) {
		return new Logger()
	}
	debug(..._args: any[]) {}
	info(..._args: any[]) {}
	error(..._args: any[]) {}
}

// Session manager (same HMAC logic as Bunbase)
const SESSION_SECRET = 'test-secret-key-for-comparison'

function verifySession(token: string): Record<string, any> | null {
	try {
		const [payloadB64, signatureB64] = token.split('.')
		if (!payloadB64 || !signatureB64) return null

		const payload = Buffer.from(payloadB64, 'base64').toString('utf8')
		const expectedSig = createHmac('sha256', SESSION_SECRET)
			.update(payloadB64)
			.digest('base64url')

		if (!timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))) {
			return null
		}

		return JSON.parse(payload)
	} catch {
		return null
	}
}

// Cookie parser (same as Bunbase)
function parseCookies(cookieHeader: string | null): Record<string, string> {
	if (!cookieHeader) return {}
	return cookieHeader.split(';').reduce(
		(acc, cookie) => {
			const [key, value] = cookie.split('=').map((c) => c.trim())
			if (key && value) {
				acc[key] = decodeURIComponent(value)
			}
			return acc
		},
		{} as Record<string, string>,
	)
}

// Trace ID generation (same as Bunbase)
function generateTraceId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Safe stringify (same as Bunbase)
function safeStringify(value: unknown): string | null {
	if (value === undefined || value === null) return null
	try {
		return JSON.stringify(value)
	} catch {
		return null
	}
}

// Simulate RunEntry creation and buffering
interface RunEntry {
	id: string
	action_name: string
	trace_id: string
	status: 'success' | 'error'
	input: string | null
	output: string | null
	error: string | null
	duration_ms: number
	started_at: number
}

const runBuffer: RunEntry[] = []

Bun.serve({
	port: 3001,
	async fetch(req) {
		const startedAt = Date.now()
		const url = new URL(req.url)

		if (url.pathname === '/hello') {
			// 1. Generate trace ID
			const traceId = generateTraceId()

			// 2. Create child logger with metadata
			const logger = new Logger().child({
				action: 'hello',
				traceId,
			})

			// 3. Parse cookies and verify session
			const cookies = parseCookies(req.headers.get('Cookie'))
			const sessionToken = cookies.bunbase_session
			let _authContext: any = {}
			if (sessionToken) {
				const payload = verifySession(sessionToken)
				if (payload) {
					_authContext = payload
				}
			}

			// 4. Extract input (query params for GET)
			const input = Object.fromEntries(url.searchParams)

			// 5. Validate input with TypeBox
			if (!Value.Check(inputSchema, input)) {
				const errors = [...Value.Errors(inputSchema, input)]
				return new Response(
					JSON.stringify({ error: 'Validation failed', errors }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					},
				)
			}

			// 6. Execute handler
			const result = { message: 'Hello World' }

			// 7. Validate output with TypeBox
			if (!Value.Check(outputSchema, result)) {
				const errors = [...Value.Errors(outputSchema, result)]
				return new Response(
					JSON.stringify({ error: 'Output validation failed', errors }),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					},
				)
			}

			// 8. Create RunEntry for persistence (simulate WriteBuffer)
			const runEntry: RunEntry = {
				id: traceId,
				action_name: 'hello',
				trace_id: traceId,
				status: 'success',
				input: safeStringify(input),
				output: safeStringify(result),
				error: null,
				duration_ms: Date.now() - startedAt,
				started_at: startedAt,
			}
			runBuffer.push(runEntry)

			// 9. Log success
			logger.debug('Action completed successfully')

			return new Response(JSON.stringify(result), {
				headers: { 'Content-Type': 'application/json' },
			})
		}

		return new Response('Not Found', { status: 404 })
	},
})

console.log('Raw Bun.serve (with overhead) listening on http://localhost:3001')
