/**
 * Bunbase Platform Module
 * Complete authentication and authorization platform for ctx.platform.*
 *
 * Phase 1: Password Auth + DB Sessions + Email System
 */

// Core foundation
export * from './core/index.ts'

// Auth flows
export * from './auth/index.ts'

// Email system
export * from './email/index.ts'

// Re-export key types for convenience
export type {
	// Core types
	User,
	UserId,
	Session,
	SessionId,
	SessionPayload,
	AuthChallenge,
	ChallengeId,
	EmailTemplate,
	TemplateId,
	EmailMessage,

	// Credential types
	PasswordCredential,

	// OAuth types
	OAuthProvider,
	OAuthAccount,
	OAuthProfile,
	OAuthTokens,
	OAuthProviderConfig,
	OAuthStartOptions,

	// MFA types
	MFAFactor,
	MFAFactorStatus,
	MFAFactorType,
	TOTPAlgorithm,
	OTPDeliveryMethod,
	StepUpSession,
	StepUpMethod,
	UserMFAStatus,

	// Email types
	EmailMessageStatus,

	// Organization types (for Phase 4)
	Organization,
	OrgId,
	OrgMembership,
	OrgInvitation,
	InvitationId,

	// RBAC types (for Phase 4)
	Role,
	RoleId,
	Permission,
	PrincipalType,

	// Billing types (for Phase 5)
	Subscription,
	SubscriptionId,
	SubscriptionStatus,
	Plan,
	PlanId,

	// Entitlement types (for Phase 5)
	Feature,
	EntitlementMap,
	EntitlementOverride,
	OverrideType,

	// Audit types (for Phase 5)
	AuditLog,
	AuditSeverity,

	// Webhook types (for Phase 5)
	WebhookEvent,
	WebhookEventStatus,

	// Helper types
	PaginatedResult,
	PaginationOptions,
} from './core/types.ts'

// Re-export key error classes for convenience
export {
	// Base errors
	PlatformError,

	// Authentication errors
	AuthenticationError,
	InvalidCredentialsError,
	EmailAlreadyExistsError,
	PhoneAlreadyExistsError,
	AccountSuspendedError,
	AccountDeletedError,
	EmailNotVerifiedError,

	// Session errors
	InvalidSessionError,
	SessionRevokedError,

	// Token & challenge errors
	InvalidTokenError,
	ChallengeExpiredError,
	TooManyAttemptsError,
	InvalidCodeError,

	// User errors
	UserNotFoundError,
	UserAlreadyExistsError,

	// Organization errors (for Phase 4)
	OrgNotFoundError,
	OrgSlugTakenError,
	NotOrgMemberError,
	InsufficientOrgRoleError,
	CannotRemoveLastOwnerError,

	// Invitation errors (for Phase 4)
	InvalidInvitationError,
	InvitationAlreadyAcceptedError,

	// RBAC errors (for Phase 4)
	RoleNotFoundError,
	PermissionNotFoundError,
	MissingPermissionError,

	// Billing errors (for Phase 5)
	SubscriptionNotFoundError,
	SubscriptionRequiredError,
	PlanNotFoundError,

	// Entitlement errors (for Phase 5)
	FeatureNotAvailableError,
	FeatureLimitExceededError,

	// Email errors
	TemplateNotFoundError,
	EmailSendError,

	// Validation errors
	WeakPasswordError,
	InvalidEmailError,
	InvalidPhoneError,

	// Error helpers
	isPlatformError,
	isAuthenticationError,
	isNotFoundError,
	isForbiddenError,
	isConflictError,
} from './core/errors.ts'

// Re-export key utilities for convenience
export {
	// ID generators
	newUserId,
	newOrgId,
	newRoleId,
	newSessionId,
	newSubscriptionId,
	newPlanId,
	newChallengeId,
	newInvitationId,
	newTemplateId,

	// Token generators
	generateVerificationToken,
	generateVerificationCode,
	generateInvitationToken,
	generateApiKey,

	// Hashing utilities
	hashToken,
	hashCode,
	constantTimeCompare,

	// Slug generation
	generateSlug,
	generateUniqueSlug,

	// Validation helpers
	isValidUUID,
	isValidEmail,
	isValidPhone,
	isValidSlug,
} from './core/ids.ts'
