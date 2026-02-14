/**
 * Platform Core Types
 * Foundation types for ctx.platform.* APIs
 */

// ====================================================================
// BRANDED TYPES (Type-safe IDs)
// ====================================================================

/**
 * Brand type for nominal typing (prevents mixing different ID types)
 */
export type Brand<T, TBrand> = T & { __brand: TBrand }

/**
 * User ID - unique identifier for users
 */
export type UserId = Brand<string, 'UserId'>

/**
 * Organization ID - unique identifier for organizations
 */
export type OrgId = Brand<string, 'OrgId'>

/**
 * Role ID - unique identifier for roles
 */
export type RoleId = Brand<string, 'RoleId'>

/**
 * Session ID - unique identifier for auth sessions
 */
export type SessionId = Brand<string, 'SessionId'>

/**
 * Subscription ID - unique identifier for subscriptions
 */
export type SubscriptionId = Brand<string, 'SubscriptionId'>

/**
 * Plan ID - unique identifier for plans
 */
export type PlanId = Brand<string, 'PlanId'>

/**
 * Challenge ID - unique identifier for auth challenges
 */
export type ChallengeId = Brand<string, 'ChallengeId'>

/**
 * Invitation ID - unique identifier for org invitations
 */
export type InvitationId = Brand<string, 'InvitationId'>

/**
 * Template ID - unique identifier for email templates
 */
export type TemplateId = Brand<string, 'TemplateId'>

// ====================================================================
// USER TYPES
// ====================================================================

/**
 * User status
 */
export type UserStatus = 'active' | 'suspended' | 'deleted' | 'invited'

/**
 * User entity
 */
export interface User {
	id: UserId
	email: string | null
	phone: string | null
	name: string | null
	avatarUrl: string | null
	status: UserStatus
	emailVerifiedAt: Date | null
	phoneVerifiedAt: Date | null
	metadata: Record<string, unknown>
	createdAt: Date
	updatedAt: Date
	lastSignInAt: Date | null
	deletedAt: Date | null
}

/**
 * User create input
 */
export interface UserCreateInput {
	email?: string
	phone?: string
	name?: string
	avatarUrl?: string
	status?: UserStatus
	metadata?: Record<string, unknown>
}

/**
 * User update input
 */
export interface UserUpdateInput {
	email?: string
	phone?: string
	name?: string
	avatarUrl?: string
	status?: UserStatus
	metadata?: Record<string, unknown>
}

// ====================================================================
// SESSION TYPES
// ====================================================================

/**
 * Session entity (database-backed)
 */
export interface Session {
	id: SessionId
	userId: UserId
	tokenHash: string
	ipAddress: string | null
	userAgent: string | null
	expiresAt: Date
	lastActiveAt: Date
	createdAt: Date
	revokedAt: Date | null
	revokeReason: string | null
}

/**
 * Session payload (HMAC-signed token content)
 */
export interface SessionPayload {
	userId: string
	sessionId: string
	exp: number // Expiration timestamp
	[key: string]: unknown
}

// ====================================================================
// CREDENTIAL TYPES
// ====================================================================

/**
 * Password credential entity
 */
export interface PasswordCredential {
	id: string
	userId: UserId
	passwordHash: string
	changedAt: Date
	createdAt: Date
}

// ====================================================================
// CHALLENGE TYPES
// ====================================================================

/**
 * Auth challenge type
 */
export type ChallengeType =
	| 'email_verification'
	| 'password_reset'
	| 'otp_email'
	| 'otp_sms'

/**
 * Auth challenge entity
 */
export interface AuthChallenge {
	id: ChallengeId
	type: ChallengeType
	identifier: string
	userId: UserId | null
	tokenHash: string
	codeHash: string | null
	expiresAt: Date
	attempts: number
	maxAttempts: number
	verifiedAt: Date | null
	createdAt: Date
}

// ====================================================================
// EMAIL TYPES
// ====================================================================

/**
 * Email template entity
 */
export interface EmailTemplate {
	id: TemplateId
	key: string
	name: string
	description: string | null
	subject: string
	htmlBody: string
	textBody: string | null
	variables: string[]
	isActive: boolean
	createdAt: Date
	updatedAt: Date
}

/**
 * Email message status
 */
export type EmailMessageStatus = 'pending' | 'sent' | 'failed' | 'bounced'

/**
 * Email message entity
 */
export interface EmailMessage {
	id: string
	templateId: TemplateId | null
	userId: UserId | null
	toEmail: string
	fromEmail: string
	subject: string
	htmlBody: string
	textBody: string | null
	status: EmailMessageStatus
	sentAt: Date | null
	failedAt: Date | null
	errorMessage: string | null
	attempts: number
	maxAttempts: number
	nextRetryAt: Date | null
	providerMessageId: string | null
	providerMetadata: Record<string, unknown> | null
	createdAt: Date
}

// ====================================================================
// ORGANIZATION TYPES
// ====================================================================

/**
 * Organization entity
 */
export interface Organization {
	id: OrgId
	name: string
	slug: string
	avatarUrl: string | null
	metadata: Record<string, unknown>
	createdAt: Date
	updatedAt: Date
	deletedAt: Date | null
}

/**
 * Organization membership entity
 */
export interface OrgMembership {
	id: string
	orgId: OrgId
	userId: UserId
	role: string
	joinedAt: Date
	invitedBy: UserId | null
}

/**
 * Organization invitation entity
 */
export interface OrgInvitation {
	id: InvitationId
	orgId: OrgId
	email: string
	role: string
	tokenHash: string
	invitedBy: UserId
	expiresAt: Date
	acceptedAt: Date | null
	acceptedBy: UserId | null
	revokedAt: Date | null
	createdAt: Date
}

// ====================================================================
// RBAC TYPES
// ====================================================================

/**
 * Role entity
 */
export interface Role {
	id: RoleId
	key: string
	name: string
	description: string | null
	weight: number
	createdAt: Date
	updatedAt: Date
}

/**
 * Permission entity
 */
export interface Permission {
	id: string
	key: string
	name: string
	description: string | null
	createdAt: Date
}

/**
 * Role-Permission mapping
 */
export interface RolePermission {
	roleId: RoleId
	permissionId: string
}

/**
 * Principal type (user or org)
 */
export type PrincipalType = 'user' | 'org'

/**
 * Principal-Role assignment
 */
export interface PrincipalRole {
	id: string
	principalType: PrincipalType
	principalId: string
	roleId: RoleId
	assignedAt: Date
	assignedBy: UserId | null
}

// ====================================================================
// BILLING TYPES
// ====================================================================

/**
 * Subscription status
 */
export type SubscriptionStatus =
	| 'active'
	| 'trialing'
	| 'past_due'
	| 'canceled'
	| 'unpaid'

/**
 * Subscription entity
 */
export interface Subscription {
	id: SubscriptionId
	userId: UserId | null
	orgId: OrgId | null
	planId: PlanId
	status: SubscriptionStatus
	currentPeriodStart: Date
	currentPeriodEnd: Date
	trialEndsAt: Date | null
	canceledAt: Date | null
	createdAt: Date
	updatedAt: Date
}

/**
 * Plan entity
 */
export interface Plan {
	id: PlanId
	key: string
	name: string
	description: string | null
	metadata: Record<string, unknown>
	isActive: boolean
	createdAt: Date
	updatedAt: Date
}

// ====================================================================
// ENTITLEMENT TYPES
// ====================================================================

/**
 * Feature entity
 */
export interface Feature {
	id: string
	key: string
	name: string
	description: string | null
	type: 'boolean' | 'limit'
	createdAt: Date
}

/**
 * Plan-Feature mapping
 */
export interface PlanFeature {
	planId: PlanId
	featureId: string
	value: boolean | number | null
}

/**
 * Entitlement override type
 */
export type OverrideType = 'grant' | 'deny' | 'limit'

/**
 * Entitlement override entity
 */
export interface EntitlementOverride {
	id: string
	principalType: PrincipalType
	principalId: string
	featureId: string
	overrideType: OverrideType
	value: boolean | number | null
	reason: string | null
	createdAt: Date
	createdBy: UserId | null
}

/**
 * Resolved entitlement map
 */
export interface EntitlementMap {
	[featureKey: string]: {
		enabled: boolean
		limit?: number | null
		source: 'plan' | 'override'
	}
}

// ====================================================================
// AUDIT TYPES
// ====================================================================

/**
 * Audit log severity
 */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical'

/**
 * Audit log entity
 */
export interface AuditLog {
	id: string
	userId: UserId | null
	orgId: OrgId | null
	action: string
	resource: string
	resourceId: string | null
	severity: AuditSeverity
	ipAddress: string | null
	userAgent: string | null
	metadata: Record<string, unknown>
	createdAt: Date
}

// ====================================================================
// WEBHOOK TYPES
// ====================================================================

/**
 * Webhook event status
 */
export type WebhookEventStatus = 'pending' | 'delivered' | 'failed'

/**
 * Webhook event entity
 */
export interface WebhookEvent {
	id: string
	webhookId: string
	event: string
	payload: Record<string, unknown>
	status: WebhookEventStatus
	attempts: number
	maxAttempts: number
	nextRetryAt: Date | null
	deliveredAt: Date | null
	failedAt: Date | null
	errorMessage: string | null
	createdAt: Date
}

// ====================================================================
// HELPER TYPES
// ====================================================================

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
	items: T[]
	total: number
	page: number
	pageSize: number
	hasMore: boolean
}

/**
 * Pagination options
 */
export interface PaginationOptions {
	page?: number
	pageSize?: number
}
