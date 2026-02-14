Final V1 Spec (Clerk-Style) for Bunbase with ctx.platform

1. Product Direction

Build framework-native auth + org + billing platform inside Bunbase.
Use custom core domain + Arctic for OAuth provider protocol.
Match Clerk-style capabilities for app builders, with stronger backend customization.
2. Canonical API Naming

Runtime identity stays ctx.auth (current user/session context).
Management/control surface is ctx.platform.*:
ctx.platform.auth
ctx.platform.users
ctx.platform.orgs
ctx.platform.roles
ctx.platform.billing
ctx.platform.entitlements
ctx.platform.invitations
ctx.platform.email
Keep ctx.iam as temporary alias for compatibility in v1, deprecate in v2.
3. Module Architecture

platform-core (shared domain types, IDs, errors, policy interfaces)
platform-auth (password, sessions, OAuth, OTP, MFA)
platform-users (profile, identifiers, lifecycle)
platform-orgs (orgs, memberships, invitations)
platform-rbac (roles, permissions, assignment)
platform-billing (plans, subscriptions, entitlements)
platform-email (templates, rendering, sending)
platform-audit (security and business audit logs)
platform-webhooks (outbound events + retries)
4. Required Data Model

Identity:
users
user_emails
user_phones
credentials_password
oauth_accounts
auth_sessions
oauth_states
Verification and factors:
auth_challenges
otp_codes
mfa_factors
mfa_backup_codes
Orgs:
organizations
organization_memberships
organization_invitations
RBAC:
roles
permissions
role_permissions
principal_roles
Billing:
plans (subject_type: user|org|both)
features
plan_features
subscriptions (subject_type: user|org)
entitlement_overrides
billing_events
Messaging and audit:
email_templates
email_messages
audit_logs
5. Core Functional Flows

Auth:
Password signup/signin/signout
Email verification
Password reset
Session list/revoke single/revoke all
OAuth:
oauth_start with state + PKCE + nonce
oauth_callback with secure state consumption
Link/unlink provider accounts
OTP and MFA:
Email/SMS OTP challenge
TOTP enroll/verify/disable
Backup codes
Step-up auth challenge support
Organizations:
Create org
Invite member
Accept/revoke invitation
Role updates and ownership transfer
Billing and entitlements:
Separate user and org subscriptions
Trialing, active, canceled, past_due
Entitlement resolution from plan + overrides
6. Entitlements Resolution (Canonical)

Resolve user subject from session.
Resolve org subject when org context exists.
Load active user subscription entitlements.
Load active org subscription entitlements when present.
Apply overrides.
Enforce deny precedence.
Expose merged map via ctx.platform.entitlements.resolve(...).
7. Guard Surface

guards.authenticated()
guards.platform.inOrg()
guards.platform.hasFeature(featureKey)
guards.platform.hasPermission(permissionKey)
guards.platform.trialActiveOrPaid()
guards.platform.entitlementLimit(featureKey, comparator)
8. Action Catalog (v1)

platform.auth.sign_up_password
platform.auth.sign_in_password
platform.auth.sign_out
platform.auth.session_me
platform.auth.session_list
platform.auth.session_revoke
platform.auth.otp_request
platform.auth.otp_verify
platform.auth.oauth_start
platform.auth.oauth_callback
platform.mfa.totp_enroll_start
platform.mfa.totp_enroll_verify
platform.mfa.challenge_verify
platform.mfa.backup_codes_regenerate
platform.users.get
platform.users.update
platform.orgs.create
platform.orgs.members.list
platform.orgs.members.update_role
platform.orgs.invitations.create
platform.orgs.invitations.accept
platform.billing.plans.list
platform.billing.subscription_get
platform.billing.subscription_change
platform.billing.subscription_cancel
platform.entitlements.get
9. Email Templates (minimum keys)

auth.verify_email
auth.password_reset
auth.magic_link
auth.otp_code
org.invitation
org.role_changed
billing.subscription_started
billing.subscription_payment_failed
billing.subscription_canceled
security.new_sign_in
10. Security Baseline

Argon2id for passwords.
Opaque random session tokens; store only hash server-side.
Cookie defaults: HttpOnly, Secure, SameSite=Lax, with explicit local-dev override.
CSRF protection for cookie-auth web flows.
OTP/MFA attempt limits and lockouts.
Provider token encryption at rest.
Full auth/org/billing audit logging.
Signed outbound webhooks + retry/backoff.
11. Rollout Plan

Phase 0: stabilize current foundation (tests green, session model cleanup, docs/API drift fixes).
Phase 1: password auth + DB sessions + email verification + reset.
Phase 2: OAuth via Arctic + account linking.
Phase 3: OTP + TOTP MFA + backup codes + step-up.
Phase 4: org invitations + role workflows + user/org subscriptions.
Phase 5: entitlements engine + webhook events + production hardening.
12. Definition of Done for V1

All phase features shipped and documented.
Security tests pass for auth/session/OAuth/MFA.
E2E flows pass for org invite and user/org subscription lifecycle.
ctx.platform.* fully usable in actions and guards.
Migration guide from ctx.iam published.