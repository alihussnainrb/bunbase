import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SessionConfig {
	secret: string
	expiresIn?: number // seconds, default 7 days
	cookieName?: string
}

export interface SessionPayload {
	userId: string
	role?: string
	[key: string]: unknown
}

export class SessionManager {
	private readonly secret: string
	private readonly expiresIn: number
	private readonly cookieName: string

	constructor(config: SessionConfig) {
		this.secret = config.secret
		this.expiresIn = config.expiresIn ?? 7 * 24 * 60 * 60
		this.cookieName = config.cookieName ?? 'bunbase_session'
	}

	/**
	 * Create a signed session cookie value
	 */
	createSession(payload: SessionPayload): string {
		const data = JSON.stringify({
			...payload,
			exp: Math.floor(Date.now() / 1000) + this.expiresIn,
		})
		const signature = this.sign(data)
		return `${Buffer.from(data).toString('base64')}.${signature}`
	}

	/**
	 * Verify and decode a session cookie value
	 */
	verifySession(token: string): SessionPayload | null {
		try {
			const [b64Data, signature] = token.split('.')
			if (!b64Data || !signature) return null

			const data = Buffer.from(b64Data, 'base64').toString()
			const expectedSignature = this.sign(data)

			if (!this.constantTimeCompare(signature, expectedSignature)) {
				return null
			}

			const payload = JSON.parse(data)
			if (payload.exp < Math.floor(Date.now() / 1000)) {
				return null
			}

			return payload
		} catch {
			return null
		}
	}

	private sign(data: string): string {
		return createHmac('sha256', this.secret).update(data).digest('base64url')
	}

	private constantTimeCompare(a: string, b: string): boolean {
		try {
			return (
				timingSafeEqual(Buffer.from(a), Buffer.from(b.padEnd(a.length))) &&
				a.length === b.length
			)
		} catch {
			return false
		}
	}

	getCookieName(): string {
		return this.cookieName
	}
}
