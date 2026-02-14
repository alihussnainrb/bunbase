# Bunbase Authentication System Revamp - Implementation Plan

## Context

This plan implements the comprehensive authentication system described in [AUTH_IMPLEMENTATION.md](AUTH_IMPLEMENTATION.md), transforming Bunbase from the current `ctx.iam` approach to a full `ctx.platform.*` API that matches Clerk-style capabilities.

**Why this change:**
- Current implementation has basic password auth + sessions but lacks OAuth, MFA, invitations
- No email template system for verification/reset flows
- Missing entitlements engine for feature flagging
- No security audit logging
- Need Clerk-level capabilities while maintaining deep backend customization

**Current State:**
- ✅ SessionManager (HMAC-SHA256 signed tokens)
- ✅ Basic password hashing (Argon2id via Bun)
- ✅ IAM managers (Role, Org, Users, Subscription)
- ✅ Guards (authenticated, hasRole, inOrg, hasFeature)
- ❌ No OAuth integration
- ❌ No MFA/OTP
- ❌ No email templates
- ❌ No entitlements with overrides
- ❌ No audit logs
- ❌ No ctx.platform API

**Target Architecture:**
- ctx.platform.auth - Password, OAuth, OTP, MFA
- ctx.platform.users - User management
- ctx.platform.orgs - Organizations + invitations
- ctx.platform.roles - RBAC
- ctx.platform.billing - Subscriptions
- ctx.platform.entitlements - Feature flags + overrides
- ctx.platform.email - Templates + sending
- ctx.platform.audit - Security logging
- ctx.platform.webhooks - Event delivery

## Module Architecture

### Platform Modules

```
packages/bunbase/src/platform/
├── core/               # Shared types, errors, IDs
├── auth/               # Password, OAuth, OTP, MFA, sessions
├── users/              # User CRUD, identifiers
├── orgs/               # Orgs, memberships, invitations
├── rbac/               # Roles, permissions, assignments
├── billing/            # Plans, subscriptions, events
├── entitlements/       # Feature resolution + overrides
├── email/              # Templates, rendering, sending
├── audit/              # Security + business audit logs
└── webhooks/           # Outbound events + retry
```

### Dependency Graph

```
platform-core (foundation)
  ↓
platform-auth → core, email, audit
platform-users → core, email, audit
platform-rbac → core, audit
  ↓
platform-orgs → core, users, rbac, email, audit
  ↓
platform-billing → core, users, orgs, audit, webhooks
platform-entitlements → core, billing
  ↓
platform-email → core, mailer adapters
platform-audit → core, db
platform-webhooks → core, queue
```

## Database Schema Changes

All new tables required for the platform layer. See complete SQL in [Database Schema Design](#database-schema-design) section below.

**Phase 1 Tables:**
- Enhanced `users` (add status, metadata, verified_at)
- `user_emails`, `user_phones` (secondary identifiers)
- `credentials_password` (separate from users)
- `auth_sessions` (DB-backed sessions for revocation)
- `auth_challenges` (verification/OTP)
- `email_templates`, `email_messages`

**Phase 2 Tables:**
- `oauth_accounts` (provider accounts)
- `oauth_states` (CSRF protection)

**Phase 3 Tables:**
- `otp_codes`, `mfa_factors`, `mfa_backup_codes`

**Phase 4 Tables:**
- `organization_invitations` (token-based)
- `principal_roles` (user/org role assignments)

**Phase 5 Tables:**
- `features`, `plan_features` (feature definitions)
- Enhanced `subscriptions` (user + org, trial_ends_at)
- `entitlement_overrides` (grant/deny/limit)
- `billing_events`, `audit_logs`

## API Surface: ctx.platform.*

### Authentication (ctx.platform.auth)

```typescript
ctx.platform.auth = {
  // Password auth
  signUpPassword(data: { email, password, name? }): Promise<{ userId, session }>
  signInPassword(data: { email, password }): Promise<{ userId, session }>
  signOut(): Promise<void>

  // Session management
  listSessions(userId): Promise<Session[]>
  revokeSession(sessionId): Promise<void>
  revokeAllSessions(userId, exceptCurrent?): Promise<void>

  // OAuth
  oauthStart(provider, options?): Promise<{ url, state }>
  oauthCallback(provider, code, state): Promise<{ userId, session }>
  linkOAuthAccount(userId, provider, code): Promise<OAuthAccount>
  unlinkOAuthAccount(userId, provider): Promise<void>

  // Email verification
  sendVerificationEmail(email): Promise<void>
  verifyEmail(token): Promise<{ userId, email }>

  // Password reset
  sendPasswordResetEmail(email): Promise<void>
  resetPassword(token, newPassword): Promise<void>

  // OTP
  requestOTP(identifier, type: 'email' | 'sms'): Promise<{ challengeId }>
  verifyOTP(challengeId, code): Promise<{ valid }>
}
```

### MFA (ctx.platform.mfa)

```typescript
ctx.platform.mfa = {
  enrollTOTP(userId): Promise<{ secret, qrCode, challengeId }>
  verifyTOTPEnrollment(challengeId, code): Promise<{ factorId, backupCodes }>
  verifyTOTP(userId, code): Promise<{ valid }>
  disableTOTP(userId, factorId): Promise<void>
  regenerateBackupCodes(userId): Promise<string[]>
  verifyBackupCode(userId, code): Promise<{ valid }>
}
```

### Organizations (ctx.platform.orgs)

```typescript
ctx.platform.orgs = {
  create(data): Promise<Organization>
  get(orgId): Promise<Organization | null>

  // Members
  addMember(orgId, userId, role): Promise<Membership>
  removeMember(orgId, userId): Promise<void>
  updateMemberRole(orgId, userId, role): Promise<Membership>
  listMembers(orgId): Promise<Membership[]>
  transferOwnership(orgId, newOwnerId): Promise<void>

  // Invitations
  createInvitation(orgId, data: { email, role, invitedBy }): Promise<Invitation>
  acceptInvitation(token, userId): Promise<Membership>
  revokeInvitation(invitationId): Promise<void>
  listInvitations(orgId): Promise<Invitation[]>
}
```

### Entitlements (ctx.platform.entitlements)

```typescript
ctx.platform.entitlements = {
  resolve(subjectType: 'user' | 'org', subjectId, orgId?): Promise<EntitlementMap>
  hasFeature(subjectType, subjectId, featureKey): Promise<boolean>
  getLimit(subjectType, subjectId, featureKey): Promise<number | null>

  // Overrides
  grantOverride(subjectType, subjectId, featureKey, value?, reason?): Promise<void>
  denyOverride(subjectType, subjectId, featureKey, reason?): Promise<void>
  removeOverride(subjectType, subjectId, featureKey): Promise<void>
}
```

### Enhanced Guards

```typescript
guards.platform = {
  // Organization
  inOrg(): GuardFn
  hasOrgRole(role): GuardFn
  isOrgOwner(): GuardFn

  // Permission
  hasPermission(permission): GuardFn
  hasAnyPermission(...permissions): GuardFn

  // Features
  hasFeature(featureKey): GuardFn
  trialActiveOrPaid(): GuardFn
  withinLimit(featureKey, usage): GuardFn

  // MFA
  mfaVerified(): GuardFn
  requireStepUp(maxAge?): GuardFn
}
```

## Phased Implementation

### Phase 0: Foundation Stabilization (Week 1)

**Goal:** Ensure all existing tests pass, document current architecture.

**Tasks:**
- Run full test suite, fix any failures
- Document current session/auth flow
- Audit existing IAM API surface
- Create performance baseline benchmarks
- Plan migration strategy

**Deliverables:**
- All tests passing
- Architecture documentation complete
- No production code changes

### Phase 1: Password Auth + DB Sessions (Weeks 2-3)

**Goal:** Implement ctx.platform.auth for password flows with database-backed sessions.

**New Files:**
```
packages/bunbase/src/platform/
├── core/
│   ├── types.ts                    # Foundation types (UserId, OrgId, etc.)
│   ├── errors.ts                   # PlatformError, AuthenticationError
│   ├── ids.ts                      # ID generation
│   └── index.ts
├── auth/
│   ├── password.ts                 # signUpPassword, signInPassword, signOut
│   ├── session-db.ts               # Database-backed sessions (list/revoke)
│   ├── verification.ts             # Email verification flows
│   ├── password-reset.ts           # Password reset flows
│   ├── types.ts
│   └── index.ts
├── users/
│   ├── manager.ts                  # User CRUD
│   ├── identifiers.ts              # Email/phone management
│   ├── types.ts
│   └── index.ts
├── email/
│   ├── template-manager.ts         # Template CRUD
│   ├── renderer.ts                 # Variable interpolation
│   ├── sender.ts                   # Email sending wrapper
│   ├── templates/
│   │   ├── auth-verify-email.ts
│   │   ├── auth-password-reset.ts
│   │   └── index.ts
│   ├── types.ts
│   └── index.ts
└── audit/
    ├── logger.ts                   # Audit log writer
    ├── types.ts
    └── index.ts
```

**Updated Files:**
- [packages/bunbase/src/runtime/context.ts](packages/bunbase/src/runtime/context.ts) - Add ctx.platform.auth, users, email (remove ctx.iam)
- [packages/bunbase/src/runtime/server.ts](packages/bunbase/src/runtime/server.ts) - Use DB sessions
- [packages/bunbase/src/index.ts](packages/bunbase/src/index.ts) - Export platform APIs (remove IAM exports)

**Files to Delete:**
- [packages/bunbase/src/iam/](packages/bunbase/src/iam/) - Remove entire IAM directory, replaced by platform

**Actions to Implement:**
- platform.auth.sign_up_password
- platform.auth.sign_in_password
- platform.auth.sign_out
- platform.auth.session_list
- platform.auth.session_revoke
- platform.auth.send_verification_email
- platform.auth.verify_email
- platform.auth.send_password_reset
- platform.auth.reset_password

### Phase 2: OAuth via Arctic (Weeks 4-5)

**Goal:** OAuth provider integration with PKCE and account linking.

**Dependencies:**
```bash
bun add arctic
```

**New Files:**
```
packages/bunbase/src/platform/auth/oauth/
├── arctic-provider.ts              # Arctic wrapper
├── state-manager.ts                # OAuth state/PKCE/nonce
├── account-linker.ts               # Link/unlink accounts
├── providers/
│   ├── google.ts
│   ├── github.ts
│   ├── microsoft.ts
│   └── index.ts
├── types.ts
└── index.ts
```

**Actions:**
- platform.auth.oauth_start
- platform.auth.oauth_callback
- platform.auth.oauth_link
- platform.auth.oauth_unlink

### Phase 3: OTP + TOTP MFA (Weeks 6-7)

**Goal:** Email/SMS OTP and TOTP MFA with backup codes.

**Dependencies:**
```bash
bun add @noble/hashes otpauth qrcode
```

**New Files:**
```
packages/bunbase/src/platform/auth/
├── otp/
│   ├── challenge-manager.ts        # OTP challenge lifecycle
│   ├── code-generator.ts           # 6-digit code generation
│   ├── sms-sender.ts               # SMS delivery (Twilio)
│   └── index.ts
├── mfa/
│   ├── totp-manager.ts             # TOTP enrollment/verification
│   ├── backup-codes.ts             # Backup code management
│   ├── step-up.ts                  # Step-up authentication
│   └── index.ts
```

**Actions:**
- platform.auth.otp_request
- platform.auth.otp_verify
- platform.mfa.totp_enroll_start
- platform.mfa.totp_enroll_verify
- platform.mfa.totp_disable
- platform.mfa.backup_codes_regenerate

### Phase 4: Organizations + RBAC (Weeks 8-9)

**Goal:** Org management, invitations, and role-based permissions.

**New Files:**
```
packages/bunbase/src/platform/
├── orgs/
│   ├── manager.ts                  # Org CRUD
│   ├── membership-manager.ts       # Add/remove members, roles
│   ├── invitation-manager.ts       # Create/accept/revoke
│   ├── ownership-transfer.ts       # Transfer ownership
│   └── index.ts
├── rbac/
│   ├── role-manager.ts             # Role CRUD
│   ├── permission-manager.ts       # Permission CRUD
│   ├── assignment-manager.ts       # Assign/revoke roles
│   ├── resolver.ts                 # Resolve permissions (cached)
│   └── index.ts
```

**Actions:**
- platform.orgs.create
- platform.orgs.members.add
- platform.orgs.members.update_role
- platform.orgs.invitations.create
- platform.orgs.invitations.accept
- platform.roles.create
- platform.roles.assign_to_user

### Phase 5: Billing + Entitlements + Webhooks (Weeks 10-11)

**Goal:** Subscriptions, entitlement resolution, and webhook delivery.

**New Files:**
```
packages/bunbase/src/platform/
├── billing/
│   ├── plan-manager.ts             # Plan CRUD
│   ├── subscription-manager.ts     # Subscription lifecycle
│   ├── event-tracker.ts            # Billing events
│   └── index.ts
├── entitlements/
│   ├── resolver.ts                 # Resolve plan + overrides
│   ├── override-manager.ts         # Grant/deny/limit overrides
│   └── index.ts
├── webhooks/
│   ├── webhook-manager.ts          # Webhook registration
│   ├── dispatcher.ts               # Delivery + retry
│   ├── signer.ts                   # HMAC signatures
│   └── index.ts
```

**Actions:**
- platform.billing.plans.list
- platform.billing.subscription_get
- platform.billing.subscription_change
- platform.billing.subscription_cancel
- platform.entitlements.resolve
- platform.entitlements.grant_override

## Security Patterns

### Password Security
- Argon2id via `Bun.password.hash()`
- Timing-safe verification
- Minimum 8 characters

### Session Security
- HMAC-SHA256 signed tokens
- Store session hash in DB for revocation
- Timing-safe comparison
- IP + User-Agent tracking

### OAuth Security
- State: Random 32-byte (CSRF)
- PKCE: code_verifier + code_challenge
- Nonce: ID token validation
- Token encryption: AES-256-GCM at rest
- 10-minute state expiry

### OTP/MFA Security
- 6-digit codes: Crypto random
- SHA-256 hashing
- Rate limiting: Max 5 attempts
- OTP expiry: 5 minutes
- TOTP secret encryption
- Backup codes: SHA-256, one-time use

### Invitation Security
- Secure tokens: Random 32-byte
- SHA-256 hashing
- 7-day expiry
- Single-use
- Email verification required

## Testing Strategy

### Unit Tests
- Password hashing/verification
- Token generation/verification
- Template rendering
- Manager methods with mocked DB

### Integration Tests
- End-to-end auth flows
- OAuth flows (mocked providers)
- Email delivery (test adapter)
- Webhook delivery

### E2E Tests
- Full user journeys
- Org invitation acceptance
- Subscription lifecycle

### Security Tests
- Timing attacks
- CSRF protection
- Brute force prevention
- SQL injection prevention
- XSS prevention

### Performance Tests
- Session lookup benchmarks
- Entitlement resolution with caching
- Permission resolution

## Migration from ctx.iam to ctx.platform

Since Bunbase is not yet in production, we will **completely replace** `ctx.iam` with `ctx.platform`:

**Breaking Changes:**
- Remove entire `packages/bunbase/src/iam/` directory
- Remove all `ctx.iam` references from documentation
- Update all example code to use `ctx.platform`
- Remove IAM exports from main index.ts

**Migration for Examples:**
- Update `examples/basic/` to use ctx.platform
- Update `examples/amantra-cpanel/` to use ctx.platform
- Update all test files to use ctx.platform

## Critical Files for Implementation

### Phase 1 (Start Here):
1. [packages/bunbase/src/platform/core/types.ts](packages/bunbase/src/platform/core/types.ts) - Foundation types
2. [packages/bunbase/src/platform/auth/session-db.ts](packages/bunbase/src/platform/auth/session-db.ts) - DB-backed sessions
3. [packages/bunbase/src/platform/auth/password.ts](packages/bunbase/src/platform/auth/password.ts) - Password flows
4. [packages/bunbase/src/runtime/context.ts](packages/bunbase/src/runtime/context.ts) - ctx.platform exposure
5. [packages/bunbase/src/platform/email/template-manager.ts](packages/bunbase/src/platform/email/template-manager.ts) - Email templates

### Phase 2 (OAuth):
1. [packages/bunbase/src/platform/auth/oauth/arctic-provider.ts](packages/bunbase/src/platform/auth/oauth/arctic-provider.ts)
2. [packages/bunbase/src/platform/auth/oauth/state-manager.ts](packages/bunbase/src/platform/auth/oauth/state-manager.ts)

### Phase 3 (MFA):
1. [packages/bunbase/src/platform/auth/otp/challenge-manager.ts](packages/bunbase/src/platform/auth/otp/challenge-manager.ts)
2. [packages/bunbase/src/platform/auth/mfa/totp-manager.ts](packages/bunbase/src/platform/auth/mfa/totp-manager.ts)

### Phase 4 (Orgs):
1. [packages/bunbase/src/platform/orgs/invitation-manager.ts](packages/bunbase/src/platform/orgs/invitation-manager.ts)
2. [packages/bunbase/src/platform/rbac/resolver.ts](packages/bunbase/src/platform/rbac/resolver.ts)

### Phase 5 (Billing):
1. [packages/bunbase/src/platform/entitlements/resolver.ts](packages/bunbase/src/platform/entitlements/resolver.ts)
2. [packages/bunbase/src/platform/webhooks/dispatcher.ts](packages/bunbase/src/platform/webhooks/dispatcher.ts)

## Estimated Timeline

- Phase 0: 1 week (stabilization)
- Phase 1: 2 weeks (password + sessions)
- Phase 2: 2 weeks (OAuth)
- Phase 3: 2 weeks (MFA)
- Phase 4: 2 weeks (orgs + RBAC)
- Phase 5: 2 weeks (billing + entitlements)

**Total: 11 weeks** (1 developer full-time)

**Can be parallelized with 2+ developers:**
- Phase 1 + Phase 2 after foundation
- Phase 3 + Phase 4 concurrently

## Verification Checklist

### Phase 1:
- [ ] Email templates seeded
- [ ] Signup flow works
- [ ] Email verification works
- [ ] Password reset works
- [ ] Session list/revoke works

### Phase 2:
- [ ] OAuth Google works
- [ ] OAuth GitHub works
- [ ] Account linking works
- [ ] CSRF protection verified

### Phase 3:
- [ ] Email OTP works
- [ ] TOTP enrollment works
- [ ] Backup codes work
- [ ] Rate limiting prevents brute force

### Phase 4:
- [ ] Org creation works
- [ ] Invitation flow works
- [ ] Role assignment works
- [ ] Permission resolution cached

### Phase 5:
- [ ] Subscription creation works
- [ ] Entitlement resolution works
- [ ] Overrides work
- [ ] Webhook delivery works

## Database Schema Design

Complete SQL schema for all phases (see full SQL in migration files):

### Phase 1 Schema
- Enhanced users table (status, metadata, verified_at)
- user_emails, user_phones (secondary identifiers)
- credentials_password (separate from users)
- auth_sessions (DB-backed for revocation)
- auth_challenges (verification/OTP)
- email_templates, email_messages

### Phase 2 Schema
- oauth_accounts (provider accounts)
- oauth_states (CSRF protection)

### Phase 3 Schema
- otp_codes, mfa_factors, mfa_backup_codes

### Phase 4 Schema
- organization_invitations (token-based)
- principal_roles (user/org assignments)

### Phase 5 Schema
- features, plan_features
- Enhanced subscriptions (user + org, trial)
- entitlement_overrides
- billing_events, audit_logs
