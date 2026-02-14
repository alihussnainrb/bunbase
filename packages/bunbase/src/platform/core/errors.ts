/**
 * Platform Core Errors
 * Custom error classes for ctx.platform.* APIs
 */

import { BunbaseError } from '../../utils/errors.ts'

// ====================================================================
// BASE PLATFORM ERROR
// ====================================================================

/**
 * Base error class for all platform errors
 */
export class PlatformError extends BunbaseError {
	constructor(
		message: string,
		statusCode = 500,
		context?: Record<string, unknown>,
	) {
		super(message, statusCode, context)
		this.name = 'PlatformError'
	}
}

// ====================================================================
// AUTHENTICATION ERRORS
// ====================================================================

/**
 * Authentication failed (invalid credentials)
 */
export class AuthenticationError extends PlatformError {
	constructor(message = 'Authentication failed', context?: Record<string, unknown>) {
		super(message, 401, context)
		this.name = 'AuthenticationError'
	}
}

/**
 * Invalid email or password
 */
export class InvalidCredentialsError extends AuthenticationError {
	constructor(context?: Record<string, unknown>) {
		super('Invalid email or password', context)
		this.name = 'InvalidCredentialsError'
	}
}

/**
 * Email already in use
 */
export class EmailAlreadyExistsError extends PlatformError {
	constructor(email: string, context?: Record<string, unknown>) {
		super(`Email ${email} is already registered`, 409, { ...context, email })
		this.name = 'EmailAlreadyExistsError'
	}
}

/**
 * Phone already in use
 */
export class PhoneAlreadyExistsError extends PlatformError {
	constructor(phone: string, context?: Record<string, unknown>) {
		super(`Phone ${phone} is already registered`, 409, { ...context, phone })
		this.name = 'PhoneAlreadyExistsError'
	}
}

/**
 * Account is suspended
 */
export class AccountSuspendedError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('Your account has been suspended', 403, context)
		this.name = 'AccountSuspendedError'
	}
}

/**
 * Account is deleted
 */
export class AccountDeletedError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('This account has been deleted', 403, context)
		this.name = 'AccountDeletedError'
	}
}

/**
 * Email not verified
 */
export class EmailNotVerifiedError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('Email address not verified', 403, context)
		this.name = 'EmailNotVerifiedError'
	}
}

// ====================================================================
// SESSION ERRORS
// ====================================================================

/**
 * Session not found or invalid
 */
export class InvalidSessionError extends AuthenticationError {
	constructor(context?: Record<string, unknown>) {
		super('Invalid or expired session', context)
		this.name = 'InvalidSessionError'
	}
}

/**
 * Session has been revoked
 */
export class SessionRevokedError extends AuthenticationError {
	constructor(context?: Record<string, unknown>) {
		super('Session has been revoked', context)
		this.name = 'SessionRevokedError'
	}
}

// ====================================================================
// TOKEN & CHALLENGE ERRORS
// ====================================================================

/**
 * Invalid or expired token
 */
export class InvalidTokenError extends PlatformError {
	constructor(message = 'Invalid or expired token', context?: Record<string, unknown>) {
		super(message, 400, context)
		this.name = 'InvalidTokenError'
	}
}

/**
 * Challenge expired
 */
export class ChallengeExpiredError extends InvalidTokenError {
	constructor(context?: Record<string, unknown>) {
		super('Verification code has expired', context)
		this.name = 'ChallengeExpiredError'
	}
}

/**
 * Too many challenge attempts
 */
export class TooManyAttemptsError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('Too many failed attempts. Please try again later.', 429, context)
		this.name = 'TooManyAttemptsError'
	}
}

/**
 * Invalid verification code
 */
export class InvalidCodeError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('Invalid verification code', 400, context)
		this.name = 'InvalidCodeError'
	}
}

// ====================================================================
// USER ERRORS
// ====================================================================

/**
 * User not found
 */
export class UserNotFoundError extends PlatformError {
	constructor(identifier: string, context?: Record<string, unknown>) {
		super(`User not found: ${identifier}`, 404, { ...context, identifier })
		this.name = 'UserNotFoundError'
	}
}

/**
 * User already exists
 */
export class UserAlreadyExistsError extends PlatformError {
	constructor(identifier: string, context?: Record<string, unknown>) {
		super(`User already exists: ${identifier}`, 409, { ...context, identifier })
		this.name = 'UserAlreadyExistsError'
	}
}

// ====================================================================
// ORGANIZATION ERRORS
// ====================================================================

/**
 * Organization not found
 */
export class OrgNotFoundError extends PlatformError {
	constructor(identifier: string, context?: Record<string, unknown>) {
		super(`Organization not found: ${identifier}`, 404, { ...context, identifier })
		this.name = 'OrgNotFoundError'
	}
}

/**
 * Organization slug already taken
 */
export class OrgSlugTakenError extends PlatformError {
	constructor(slug: string, context?: Record<string, unknown>) {
		super(`Organization slug "${slug}" is already taken`, 409, { ...context, slug })
		this.name = 'OrgSlugTakenError'
	}
}

/**
 * Not a member of organization
 */
export class NotOrgMemberError extends PlatformError {
	constructor(orgId: string, context?: Record<string, unknown>) {
		super('You are not a member of this organization', 403, { ...context, orgId })
		this.name = 'NotOrgMemberError'
	}
}

/**
 * Insufficient organization role
 */
export class InsufficientOrgRoleError extends PlatformError {
	constructor(requiredRole: string, context?: Record<string, unknown>) {
		super(`This action requires "${requiredRole}" role`, 403, { ...context, requiredRole })
		this.name = 'InsufficientOrgRoleError'
	}
}

/**
 * Cannot remove last owner
 */
export class CannotRemoveLastOwnerError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('Cannot remove the last owner from an organization', 400, context)
		this.name = 'CannotRemoveLastOwnerError'
	}
}

// ====================================================================
// INVITATION ERRORS
// ====================================================================

/**
 * Invitation not found or expired
 */
export class InvalidInvitationError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('Invalid or expired invitation', 400, context)
		this.name = 'InvalidInvitationError'
	}
}

/**
 * Invitation already accepted
 */
export class InvitationAlreadyAcceptedError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('This invitation has already been accepted', 400, context)
		this.name = 'InvitationAlreadyAcceptedError'
	}
}

// ====================================================================
// RBAC ERRORS
// ====================================================================

/**
 * Role not found
 */
export class RoleNotFoundError extends PlatformError {
	constructor(identifier: string, context?: Record<string, unknown>) {
		super(`Role not found: ${identifier}`, 404, { ...context, identifier })
		this.name = 'RoleNotFoundError'
	}
}

/**
 * Permission not found
 */
export class PermissionNotFoundError extends PlatformError {
	constructor(identifier: string, context?: Record<string, unknown>) {
		super(`Permission not found: ${identifier}`, 404, { ...context, identifier })
		this.name = 'PermissionNotFoundError'
	}
}

/**
 * Missing required permission
 */
export class MissingPermissionError extends PlatformError {
	constructor(permission: string, context?: Record<string, unknown>) {
		super(`Missing required permission: ${permission}`, 403, { ...context, permission })
		this.name = 'MissingPermissionError'
	}
}

// ====================================================================
// BILLING ERRORS
// ====================================================================

/**
 * Subscription not found
 */
export class SubscriptionNotFoundError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('No active subscription found', 404, context)
		this.name = 'SubscriptionNotFoundError'
	}
}

/**
 * Subscription required
 */
export class SubscriptionRequiredError extends PlatformError {
	constructor(context?: Record<string, unknown>) {
		super('This feature requires an active subscription', 402, context)
		this.name = 'SubscriptionRequiredError'
	}
}

/**
 * Plan not found
 */
export class PlanNotFoundError extends PlatformError {
	constructor(identifier: string, context?: Record<string, unknown>) {
		super(`Plan not found: ${identifier}`, 404, { ...context, identifier })
		this.name = 'PlanNotFoundError'
	}
}

// ====================================================================
// ENTITLEMENT ERRORS
// ====================================================================

/**
 * Feature not available on current plan
 */
export class FeatureNotAvailableError extends PlatformError {
	constructor(featureKey: string, context?: Record<string, unknown>) {
		super(`Feature "${featureKey}" is not available on your current plan`, 403, { ...context, featureKey })
		this.name = 'FeatureNotAvailableError'
	}
}

/**
 * Feature limit exceeded
 */
export class FeatureLimitExceededError extends PlatformError {
	constructor(featureKey: string, limit: number, context?: Record<string, unknown>) {
		super(`Feature "${featureKey}" limit exceeded (max: ${limit})`, 429, { ...context, featureKey, limit })
		this.name = 'FeatureLimitExceededError'
	}
}

// ====================================================================
// EMAIL ERRORS
// ====================================================================

/**
 * Email template not found
 */
export class TemplateNotFoundError extends PlatformError {
	constructor(key: string, context?: Record<string, unknown>) {
		super(`Email template not found: ${key}`, 404, { ...context, templateKey: key })
		this.name = 'TemplateNotFoundError'
	}
}

/**
 * Email sending failed
 */
export class EmailSendError extends PlatformError {
	constructor(reason: string, context?: Record<string, unknown>) {
		super(`Failed to send email: ${reason}`, 500, context)
		this.name = 'EmailSendError'
	}
}

// ====================================================================
// VALIDATION ERRORS
// ====================================================================

/**
 * Weak password
 */
export class WeakPasswordError extends PlatformError {
	constructor(requirements: string, context?: Record<string, unknown>) {
		super(`Password does not meet requirements: ${requirements}`, 400, context)
		this.name = 'WeakPasswordError'
	}
}

/**
 * Invalid email format
 */
export class InvalidEmailError extends PlatformError {
	constructor(email: string, context?: Record<string, unknown>) {
		super(`Invalid email format: ${email}`, 400, { ...context, email })
		this.name = 'InvalidEmailError'
	}
}

/**
 * Invalid phone format
 */
export class InvalidPhoneError extends PlatformError {
	constructor(phone: string, context?: Record<string, unknown>) {
		super(`Invalid phone format: ${phone}`, 400, { ...context, phone })
		this.name = 'InvalidPhoneError'
	}
}

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================

/**
 * Check if an error is a platform error
 */
export function isPlatformError(error: unknown): error is PlatformError {
	return error instanceof PlatformError
}

/**
 * Check if an error is an authentication error
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
	return error instanceof AuthenticationError
}

/**
 * Check if an error is a not-found error
 */
export function isNotFoundError(error: unknown): boolean {
	if (!isPlatformError(error)) return false
	return error.statusCode === 404
}

/**
 * Check if an error is a forbidden error
 */
export function isForbiddenError(error: unknown): boolean {
	if (!isPlatformError(error)) return false
	return error.statusCode === 403
}

/**
 * Check if an error is a conflict error
 */
export function isConflictError(error: unknown): boolean {
	if (!isPlatformError(error)) return false
	return error.statusCode === 409
}
