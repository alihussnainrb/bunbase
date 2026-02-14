/**
 * Platform Context Manager
 * Provides access to all platform managers via ctx.platform.*
 */

import type { SQL } from 'bun'
import type { Logger } from '../logger/index.ts'

// Auth managers
import { SessionDBManager } from './auth/session-db.ts'
import { PasswordAuthManager } from './auth/password.ts'
import { VerificationManager } from './auth/verification.ts'
import { PasswordResetManager } from './auth/password-reset.ts'
import { OAuthManager } from './auth/oauth/oauth-manager.ts'
import { OTPManager } from './auth/mfa/otp-manager.ts'
import { TOTPManager } from './auth/mfa/totp-manager.ts'
import { StepUpManager } from './auth/mfa/stepup-manager.ts'

// Email managers
import { TemplateManager } from './email/template-manager.ts'
import { TemplateRenderer } from './email/template-renderer.ts'
import { EmailSender } from './email/sender.ts'

// Organization managers
import { OrganizationManager } from './orgs/manager.ts'
import { MembershipManager } from './orgs/membership-manager.ts'
import { InvitationManager } from './orgs/invitation-manager.ts'

// RBAC managers
import { RoleManager } from './rbac/role-manager.ts'
import { PermissionManager } from './rbac/permission-manager.ts'
import { AssignmentManager } from './rbac/assignment-manager.ts'

// Billing managers
import { PlanManager } from './billing/plan-manager.ts'
import { SubscriptionManager } from './billing/subscription-manager.ts'

// Entitlements managers
import { EntitlementResolver } from './entitlements/resolver.ts'
import { OverrideManager } from './entitlements/override-manager.ts'

// Webhook managers
import { WebhookManager } from './webhooks/webhook-manager.ts'
import { WebhookDispatcher } from './webhooks/dispatcher.ts'

export interface PlatformManager {
	/** Authentication and session management */
	auth: {
		/** Session management (create, verify, revoke) */
		sessions: SessionDBManager
		/** Password authentication (signup, signin, signout) */
		password: PasswordAuthManager
		/** Email verification flows */
		verification: VerificationManager
		/** Password reset flows */
		passwordReset: PasswordResetManager
		/** OAuth provider integration */
		oauth: OAuthManager
		/** OTP (one-time password) management */
		otp: OTPManager
		/** TOTP (time-based OTP) management */
		totp: TOTPManager
		/** Step-up authentication */
		stepUp: StepUpManager
	}

	/** Email system */
	email: {
		/** Template management */
		templates: TemplateManager
		/** Template rendering */
		renderer: TemplateRenderer
		/** Email sending */
		sender: EmailSender
	}

	/** Organization management */
	orgs: {
		/** Organization CRUD */
		organizations: OrganizationManager
		/** Membership management */
		memberships: MembershipManager
		/** Invitation management */
		invitations: InvitationManager
	}

	/** Role-Based Access Control */
	rbac: {
		/** Role management */
		roles: RoleManager
		/** Permission management */
		permissions: PermissionManager
		/** Role assignment and permission resolution */
		assignments: AssignmentManager
	}

	/** Billing and subscriptions */
	billing: {
		/** Plan management */
		plans: PlanManager
		/** Subscription management */
		subscriptions: SubscriptionManager
	}

	/** Entitlements and feature flags */
	entitlements: {
		/** Feature access resolution */
		resolver: EntitlementResolver
		/** Entitlement overrides */
		overrides: OverrideManager
	}

	/** Webhook event delivery */
	webhooks: {
		/** Webhook endpoint management */
		webhooks: WebhookManager
		/** Event dispatcher with retry */
		dispatcher: WebhookDispatcher
	}
}

export interface CreatePlatformManagerOptions {
	sql: SQL
	logger: Logger
}

/**
 * Create platform manager with all authentication and authorization services
 */
export function createPlatformManager(
	opts: CreatePlatformManagerOptions,
): PlatformManager {
	const { sql, logger } = opts

	// Initialize all managers
	const sessionDB = new SessionDBManager(sql, logger)
	const passwordAuth = new PasswordAuthManager(sql, logger)
	const verification = new VerificationManager(sql, logger)
	const passwordReset = new PasswordResetManager(sql, logger)
	const oauth = new OAuthManager(sql, logger)
	const otp = new OTPManager(sql, logger)
	const totp = new TOTPManager(sql, logger)
	const stepUp = new StepUpManager(sql, logger)

	const templateManager = new TemplateManager(sql, logger)
	const templateRenderer = new TemplateRenderer()
	const emailSender = new EmailSender(sql, logger)

	const orgManager = new OrganizationManager(sql, logger)
	const membershipManager = new MembershipManager(sql, logger)
	const invitationManager = new InvitationManager(sql, logger)

	const roleManager = new RoleManager(sql, logger)
	const permissionManager = new PermissionManager(sql, logger)
	const assignmentManager = new AssignmentManager(sql, logger)

	const planManager = new PlanManager(sql, logger)
	const subscriptionManager = new SubscriptionManager(sql, logger)

	const entitlementResolver = new EntitlementResolver(sql, logger)
	const overrideManager = new OverrideManager(sql, logger)

	const webhookManager = new WebhookManager(sql, logger)
	const webhookDispatcher = new WebhookDispatcher(sql, logger)

	return {
		auth: {
			sessions: sessionDB,
			password: passwordAuth,
			verification,
			passwordReset,
			oauth,
			otp,
			totp,
			stepUp,
		},
		email: {
			templates: templateManager,
			renderer: templateRenderer,
			sender: emailSender,
		},
		orgs: {
			organizations: orgManager,
			memberships: membershipManager,
			invitations: invitationManager,
		},
		rbac: {
			roles: roleManager,
			permissions: permissionManager,
			assignments: assignmentManager,
		},
		billing: {
			plans: planManager,
			subscriptions: subscriptionManager,
		},
		entitlements: {
			resolver: entitlementResolver,
			overrides: overrideManager,
		},
		webhooks: {
			webhooks: webhookManager,
			dispatcher: webhookDispatcher,
		},
	}
}
