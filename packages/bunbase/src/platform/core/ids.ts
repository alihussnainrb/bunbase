/**
 * Platform Core ID Generation
 * Type-safe ID generation for platform entities
 */

import type {
	UserId,
	OrgId,
	RoleId,
	SessionId,
	SubscriptionId,
	PlanId,
	ChallengeId,
	InvitationId,
	TemplateId,
} from './types.ts'

// ====================================================================
// ID GENERATION
// ====================================================================

/**
 * Generate a secure random ID using crypto.randomUUID()
 */
function generateId(): string {
	return crypto.randomUUID()
}

/**
 * Generate a short random ID (12 characters, URL-safe)
 * Uses base62 encoding for compact IDs
 */
function generateShortId(): string {
	const chars =
		'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
	const bytes = new Uint8Array(12)
	crypto.getRandomValues(bytes)

	let id = ''
	for (const byte of bytes) {
		id += chars[byte % chars.length]
	}
	return id
}

/**
 * Generate a secure token (32 bytes, base64url encoded)
 */
function generateSecureToken(): string {
	const bytes = new Uint8Array(32)
	crypto.getRandomValues(bytes)
	return Buffer.from(bytes).toString('base64url')
}

// ====================================================================
// TYPED ID GENERATORS
// ====================================================================

/**
 * Generate a new user ID
 */
export function newUserId(): UserId {
	return generateId() as UserId
}

/**
 * Generate a new organization ID
 */
export function newOrgId(): OrgId {
	return generateId() as OrgId
}

/**
 * Generate a new role ID
 */
export function newRoleId(): RoleId {
	return generateId() as RoleId
}

/**
 * Generate a new session ID
 */
export function newSessionId(): SessionId {
	return generateId() as SessionId
}

/**
 * Generate a new subscription ID
 */
export function newSubscriptionId(): SubscriptionId {
	return generateId() as SubscriptionId
}

/**
 * Generate a new plan ID
 */
export function newPlanId(): PlanId {
	return generateId() as PlanId
}

/**
 * Generate a new challenge ID
 */
export function newChallengeId(): ChallengeId {
	return generateId() as ChallengeId
}

/**
 * Generate a new invitation ID
 */
export function newInvitationId(): InvitationId {
	return generateId() as InvitationId
}

/**
 * Generate a new template ID
 */
export function newTemplateId(): TemplateId {
	return generateId() as TemplateId
}

// ====================================================================
// TOKEN GENERATORS
// ====================================================================

/**
 * Generate a secure verification token (for email verification, password reset)
 * Returns 32-byte base64url-encoded string (43 characters)
 */
export function generateVerificationToken(): string {
	return generateSecureToken()
}

/**
 * Generate a short verification code (6 digits, for OTP)
 */
export function generateVerificationCode(): string {
	const code = Math.floor(100000 + Math.random() * 900000)
	return code.toString()
}

/**
 * Generate an invitation token (32-byte base64url-encoded)
 */
export function generateInvitationToken(): string {
	return generateSecureToken()
}

/**
 * Generate an API key (32-byte base64url-encoded with prefix)
 */
export function generateApiKey(prefix = 'bb'): string {
	return `${prefix}_${generateSecureToken()}`
}

// ====================================================================
// HASHING UTILITIES
// ====================================================================

/**
 * Hash a token using SHA-256 (for secure storage in database)
 * Returns hex-encoded hash
 */
export async function hashToken(token: string): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(token)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
	return hashHex
}

/**
 * Hash a verification code using SHA-256
 * Returns hex-encoded hash
 */
export async function hashCode(code: string): Promise<string> {
	return hashToken(code)
}

/**
 * Timing-safe comparison of two strings (prevents timing attacks)
 */
export function constantTimeCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false

	let result = 0
	for (let i = 0; i < a.length; i++) {
		// biome-ignore lint: XOR comparison for timing safety
		result |= a.charCodeAt(i) ^ b.charCodeAt(i)
	}
	return result === 0
}

// ====================================================================
// SLUG GENERATION
// ====================================================================

/**
 * Generate a URL-safe slug from text
 */
export function generateSlug(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '') // Remove non-word chars
		.replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
		.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug with random suffix
 */
export function generateUniqueSlug(text: string): string {
	const baseSlug = generateSlug(text)
	const suffix = generateShortId().slice(0, 6).toLowerCase()
	return `${baseSlug}-${suffix}`
}

// ====================================================================
// TYPE GUARDS
// ====================================================================

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(id: string): boolean {
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
	return uuidRegex.test(id)
}

/**
 * Check if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	return emailRegex.test(email)
}

/**
 * Check if a string is a valid phone number (E.164 format)
 */
export function isValidPhone(phone: string): boolean {
	const phoneRegex = /^\+[1-9]\d{1,14}$/
	return phoneRegex.test(phone)
}

/**
 * Check if a string is a valid slug
 */
export function isValidSlug(slug: string): boolean {
	const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
	return slugRegex.test(slug)
}
