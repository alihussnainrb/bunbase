/**
 * Platform Migrations
 * All database migrations for the Bunbase Platform authentication system
 */

export interface PlatformMigration {
	id: string
	name: string
	up: string
	down: string
}

export const PLATFORM_MIGRATIONS: PlatformMigration[] = [
	// ====================================================================
	// Password Auth + DB Sessions + Email System
	// ====================================================================
	{
		id: '001',
		name: 'auth_foundation',
		up: `-- ====================================================================
-- Phase 1: Password Auth + DB Sessions + Email System
-- ====================================================================

-- Updated_at trigger function (reusable)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- Enhanced Users Table
-- ====================================================================

-- Add new columns to users table if they don't exist
DO $$
BEGIN
	-- Add status column
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'status'
	) THEN
		ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
	END IF;

	-- Add metadata column
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'metadata'
	) THEN
		ALTER TABLE users ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
	END IF;

	-- Add phone_verified_at column
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'phone_verified_at'
	) THEN
		ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;
	END IF;

	-- Add updated_at column
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'updated_at'
	) THEN
		ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
	END IF;
END $$;

-- Add status index
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
	BEFORE UPDATE ON users
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Secondary Email Addresses
-- ====================================================================

CREATE TABLE IF NOT EXISTS user_emails (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	email TEXT UNIQUE NOT NULL,
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	verified_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON user_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_emails_email ON user_emails(email);
CREATE INDEX IF NOT EXISTS idx_user_emails_primary ON user_emails(user_id, is_primary);

CREATE TRIGGER trg_user_emails_updated_at
	BEFORE UPDATE ON user_emails
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Secondary Phone Numbers
-- ====================================================================

CREATE TABLE IF NOT EXISTS user_phones (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	phone TEXT UNIQUE NOT NULL,
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	verified_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_phones_user_id ON user_phones(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phones_phone ON user_phones(phone);
CREATE INDEX IF NOT EXISTS idx_user_phones_primary ON user_phones(user_id, is_primary);

CREATE TRIGGER trg_user_phones_updated_at
	BEFORE UPDATE ON user_phones
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Password Credentials
-- ====================================================================

CREATE TABLE IF NOT EXISTS credentials_password (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	password_hash TEXT NOT NULL,
	last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credentials_password_user_id ON credentials_password(user_id);

CREATE TRIGGER trg_credentials_password_updated_at
	BEFORE UPDATE ON credentials_password
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Database-Backed Sessions
-- ====================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT UNIQUE NOT NULL,
	ip_address TEXT,
	user_agent TEXT,
	expires_at TIMESTAMPTZ NOT NULL,
	last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	revoked_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- ====================================================================
-- Auth Challenges (Verification, OTP, etc.)
-- ====================================================================

CREATE TABLE IF NOT EXISTS auth_challenges (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	type TEXT NOT NULL,
	identifier TEXT NOT NULL,
	user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT,
	code_hash TEXT,
	expires_at TIMESTAMPTZ NOT NULL,
	attempts INT NOT NULL DEFAULT 0,
	max_attempts INT NOT NULL DEFAULT 5,
	verified_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_type ON auth_challenges(type);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_identifier ON auth_challenges(identifier);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_id ON auth_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_token_hash ON auth_challenges(token_hash);

-- ====================================================================
-- Email Templates
-- ====================================================================

CREATE TABLE IF NOT EXISTS email_templates (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	key TEXT UNIQUE NOT NULL,
	name TEXT NOT NULL,
	subject TEXT NOT NULL,
	html_body TEXT NOT NULL,
	text_body TEXT,
	variables TEXT[] NOT NULL DEFAULT '{}',
	is_active BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

CREATE TRIGGER trg_email_templates_updated_at
	BEFORE UPDATE ON email_templates
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Email Messages (Delivery Tracking)
-- ====================================================================

CREATE TABLE IF NOT EXISTS email_messages (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	template_id TEXT REFERENCES email_templates(id) ON DELETE SET NULL,
	user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	to_email TEXT NOT NULL,
	from_email TEXT NOT NULL,
	subject TEXT NOT NULL,
	html_body TEXT NOT NULL,
	text_body TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	provider_id TEXT,
	provider_response JSONB,
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ,
	sent_at TIMESTAMPTZ,
	delivered_at TIMESTAMPTZ,
	bounced_at TIMESTAMPTZ,
	failed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status);
CREATE INDEX IF NOT EXISTS idx_email_messages_to_email ON email_messages(to_email);
CREATE INDEX IF NOT EXISTS idx_email_messages_user_id ON email_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_created_at ON email_messages(created_at DESC);

-- ====================================================================
-- Seed Default Email Templates
-- ====================================================================

INSERT INTO email_templates (id, key, name, subject, html_body, text_body, variables) VALUES
	('tmpl_verify_email', 'auth-verify-email', 'Email Verification',
	 'Verify your email - {{appName}}',
	 '<p>Hi {{userName}},</p><p>Please verify your email by clicking: <a href="{{verificationUrl}}">Verify Email</a></p><p>This link expires in {{expiresIn}}.</p>',
	 'Hi {{userName}}, Please verify your email: {{verificationUrl}} This link expires in {{expiresIn}}.',
	 ARRAY['userName', 'verificationUrl', 'expiresIn', 'appName']),

	('tmpl_reset_password', 'auth-password-reset', 'Password Reset',
	 'Reset your password - {{appName}}',
	 '<p>Hi {{userName}},</p><p>Click here to reset your password: <a href="{{resetUrl}}">Reset Password</a></p><p>This link expires in {{expiresIn}}.</p>',
	 'Hi {{userName}}, Reset your password: {{resetUrl}} This link expires in {{expiresIn}}.',
	 ARRAY['userName', 'resetUrl', 'expiresIn', 'appName']),

	('tmpl_otp_email', 'auth-otp-email', 'OTP Code',
	 'Your verification code',
	 '<p>Your verification code is: <strong>{{code}}</strong></p><p>This code expires in {{expiresIn}}.</p>',
	 'Your verification code is: {{code}} (expires in {{expiresIn}})',
	 ARRAY['code', 'expiresIn'])
ON CONFLICT (key) DO NOTHING;

-- ====================================================================
-- Cleanup Function
-- ====================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_platform_records() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER := 0;
	temp_count INTEGER;
BEGIN
	-- Clean up expired sessions
	DELETE FROM auth_sessions WHERE expires_at < NOW();
	GET DIAGNOSTICS temp_count = ROW_COUNT;
	deleted_count := deleted_count + temp_count;

	-- Clean up expired auth challenges
	DELETE FROM auth_challenges WHERE expires_at < NOW() AND verified_at IS NULL;
	GET DIAGNOSTICS temp_count = ROW_COUNT;
	deleted_count := deleted_count + temp_count;

	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;`,
		down: `-- Rollback Phase 1

DROP FUNCTION IF EXISTS cleanup_expired_platform_records();
DROP TABLE IF EXISTS email_messages;
DROP TABLE IF EXISTS email_templates;
DROP TABLE IF EXISTS auth_challenges;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS credentials_password;
DROP TABLE IF EXISTS user_phones;
DROP TABLE IF EXISTS user_emails;
DROP FUNCTION IF EXISTS update_updated_at_column();`,
	},

	// ====================================================================
	// PHASE 2: OAuth Integration
	// ====================================================================
	{
		id: '002',
		name: 'oauth',
		up: `-- ====================================================================
-- OAuth Integration
-- ====================================================================

-- OAuth Provider Accounts
CREATE TABLE IF NOT EXISTS oauth_accounts (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	provider TEXT NOT NULL,
	provider_account_id TEXT NOT NULL,
	access_token TEXT,
	refresh_token TEXT,
	token_type TEXT,
	expires_at TIMESTAMPTZ,
	scope TEXT,
	id_token TEXT,
	profile JSONB NOT NULL DEFAULT '{}',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_account ON oauth_accounts(provider, provider_account_id);

CREATE TRIGGER trg_oauth_accounts_updated_at
	BEFORE UPDATE ON oauth_accounts
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- OAuth State Storage (CSRF + PKCE)
CREATE TABLE IF NOT EXISTS oauth_states (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	state TEXT NOT NULL UNIQUE,
	code_verifier TEXT NOT NULL,
	code_challenge TEXT NOT NULL,
	code_challenge_method TEXT NOT NULL DEFAULT 'S256',
	nonce TEXT,
	provider TEXT NOT NULL,
	redirect_uri TEXT NOT NULL,
	return_to TEXT,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Cleanup Function
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM oauth_states WHERE expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;`,
		down: `-- Rollback Phase 2

DROP FUNCTION IF EXISTS cleanup_expired_oauth_states();
DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS oauth_accounts;`,
	},

	// ====================================================================
	// PHASE 3: OTP + TOTP MFA
	// ====================================================================
	{
		id: '003',
		name: 'mfa',
		up: `-- ====================================================================
-- OTP + TOTP MFA
-- ====================================================================

-- OTP Codes
CREATE TABLE IF NOT EXISTS otp_codes (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	challenge_id TEXT NOT NULL REFERENCES auth_challenges(id) ON DELETE CASCADE,
	delivery_method TEXT NOT NULL,
	recipient TEXT NOT NULL,
	code_hash TEXT NOT NULL,
	attempts INT NOT NULL DEFAULT 0,
	max_attempts INT NOT NULL DEFAULT 5,
	expires_at TIMESTAMPTZ NOT NULL,
	verified_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_challenge_id ON otp_codes(challenge_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_recipient ON otp_codes(recipient);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);

-- MFA Factors (TOTP)
CREATE TABLE IF NOT EXISTS mfa_factors (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	type TEXT NOT NULL,
	name TEXT,
	secret TEXT NOT NULL,
	algorithm TEXT NOT NULL DEFAULT 'SHA1',
	digits INT NOT NULL DEFAULT 6,
	period INT NOT NULL DEFAULT 30,
	status TEXT NOT NULL DEFAULT 'pending',
	enrollment_challenge_id TEXT REFERENCES auth_challenges(id) ON DELETE SET NULL,
	verified_at TIMESTAMPTZ,
	last_used_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_id ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_status ON mfa_factors(status);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_type ON mfa_factors(type);

CREATE TRIGGER trg_mfa_factors_updated_at
	BEFORE UPDATE ON mfa_factors
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- MFA Backup Codes
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code_hash TEXT NOT NULL UNIQUE,
	used_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_code_hash ON mfa_backup_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_used_at ON mfa_backup_codes(used_at);

-- Step-Up Authentication Sessions
CREATE TABLE IF NOT EXISTS stepup_sessions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
	method TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stepup_sessions_user_id ON stepup_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_stepup_sessions_session_id ON stepup_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_stepup_sessions_expires_at ON stepup_sessions(expires_at);

-- Cleanup Functions
CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM otp_codes WHERE expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_stepup_sessions() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM stepup_sessions WHERE expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Helper Views
CREATE OR REPLACE VIEW user_active_mfa_factors AS
SELECT
	user_id,
	COUNT(*) as active_factor_count,
	BOOL_OR(type = 'totp') as has_totp
FROM mfa_factors
WHERE status = 'active'
GROUP BY user_id;

CREATE OR REPLACE VIEW users_with_mfa AS
SELECT DISTINCT user_id
FROM mfa_factors
WHERE status = 'active';`,
		down: `-- Rollback Phase 3

DROP VIEW IF EXISTS users_with_mfa;
DROP VIEW IF EXISTS user_active_mfa_factors;
DROP FUNCTION IF EXISTS cleanup_expired_stepup_sessions();
DROP FUNCTION IF EXISTS cleanup_expired_otp_codes();
DROP TABLE IF EXISTS stepup_sessions;
DROP TABLE IF EXISTS mfa_backup_codes;
DROP TABLE IF EXISTS mfa_factors;
DROP TABLE IF EXISTS otp_codes;`,
	},

	// ====================================================================
	// PHASE 4: Organizations + RBAC
	// ====================================================================
	{
		id: '004',
		name: 'orgs_rbac',
		up: `-- ====================================================================
-- Organizations + RBAC
-- ====================================================================

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	name TEXT NOT NULL,
	slug TEXT UNIQUE NOT NULL,
	description TEXT,
	logo_url TEXT,
	owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
	settings JSONB NOT NULL DEFAULT '{}',
	metadata JSONB NOT NULL DEFAULT '{}',
	status TEXT NOT NULL DEFAULT 'active',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

CREATE TRIGGER trg_organizations_updated_at
	BEFORE UPDATE ON organizations
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- Organization Memberships
CREATE TABLE IF NOT EXISTS organization_memberships (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role_id TEXT NOT NULL,
	invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
	invitation_id TEXT,
	joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_role_id ON organization_memberships(role_id);

CREATE TRIGGER trg_org_memberships_updated_at
	BEFORE UPDATE ON organization_memberships
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- Organization Invitations
CREATE TABLE IF NOT EXISTS organization_invitations (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	role_id TEXT NOT NULL,
	invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	message TEXT,
	token_hash TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'pending',
	accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
	accepted_at TIMESTAMPTZ,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token_hash ON organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON organization_invitations(status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_expires_at ON organization_invitations(expires_at);

CREATE TRIGGER trg_org_invitations_updated_at
	BEFORE UPDATE ON organization_invitations
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- Roles
CREATE TABLE IF NOT EXISTS roles (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	name TEXT NOT NULL,
	description TEXT,
	key TEXT NOT NULL,
	scope TEXT NOT NULL,
	weight INT NOT NULL DEFAULT 0,
	organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
	is_system BOOLEAN NOT NULL DEFAULT FALSE,
	metadata JSONB NOT NULL DEFAULT '{}',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(key, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_roles_key ON roles(key);
CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope);
CREATE INDEX IF NOT EXISTS idx_roles_org_id ON roles(organization_id);

CREATE TRIGGER trg_roles_updated_at
	BEFORE UPDATE ON roles
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	name TEXT NOT NULL,
	description TEXT,
	key TEXT NOT NULL UNIQUE,
	resource TEXT NOT NULL,
	action TEXT NOT NULL,
	metadata JSONB NOT NULL DEFAULT '{}',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(key);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

CREATE TRIGGER trg_permissions_updated_at
	BEFORE UPDATE ON permissions
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- Role-Permission Assignments
CREATE TABLE IF NOT EXISTS role_permissions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
	permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- Principal Role Assignments
CREATE TABLE IF NOT EXISTS principal_roles (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	principal_type TEXT NOT NULL,
	principal_id TEXT NOT NULL,
	role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
	context_type TEXT,
	context_id TEXT,
	granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
	granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(principal_type, principal_id, role_id, context_type, context_id)
);

CREATE INDEX IF NOT EXISTS idx_principal_roles_principal ON principal_roles(principal_type, principal_id);
CREATE INDEX IF NOT EXISTS idx_principal_roles_role_id ON principal_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_principal_roles_context ON principal_roles(context_type, context_id);

-- Seed Default Roles
INSERT INTO roles (id, name, description, key, scope, is_system) VALUES
	('role_org_owner', 'Organization Owner', 'Full control over the organization', 'org_owner', 'organization', true),
	('role_org_admin', 'Organization Admin', 'Administrative access to the organization', 'org_admin', 'organization', true),
	('role_org_member', 'Organization Member', 'Basic member access', 'org_member', 'organization', true)
ON CONFLICT (key, organization_id) DO NOTHING;

-- Seed Permissions
INSERT INTO permissions (id, name, description, key, resource, action) VALUES
	('perm_org_update', 'Update Organization', 'Update organization details', 'org:update', 'organization', 'update'),
	('perm_org_delete', 'Delete Organization', 'Delete the organization', 'org:delete', 'organization', 'delete'),
	('perm_org_settings', 'Manage Organization Settings', 'Manage organization settings', 'org:settings:manage', 'organization', 'manage'),
	('perm_member_invite', 'Invite Members', 'Invite new members to the organization', 'member:invite', 'member', 'create'),
	('perm_member_remove', 'Remove Members', 'Remove members from the organization', 'member:remove', 'member', 'delete'),
	('perm_member_role', 'Manage Member Roles', 'Update member roles', 'member:role:update', 'member', 'update'),
	('perm_member_list', 'List Members', 'View organization members', 'member:list', 'member', 'read'),
	('perm_billing_manage', 'Manage Billing', 'Manage billing and subscriptions', 'billing:manage', 'billing', 'manage'),
	('perm_billing_view', 'View Billing', 'View billing information', 'billing:view', 'billing', 'read')
ON CONFLICT (key) DO NOTHING;

-- Assign Permissions to Roles
INSERT INTO role_permissions (role_id, permission_id) VALUES
	('role_org_owner', 'perm_org_update'),
	('role_org_owner', 'perm_org_delete'),
	('role_org_owner', 'perm_org_settings'),
	('role_org_owner', 'perm_member_invite'),
	('role_org_owner', 'perm_member_remove'),
	('role_org_owner', 'perm_member_role'),
	('role_org_owner', 'perm_member_list'),
	('role_org_owner', 'perm_billing_manage'),
	('role_org_owner', 'perm_billing_view'),
	('role_org_admin', 'perm_org_update'),
	('role_org_admin', 'perm_org_settings'),
	('role_org_admin', 'perm_member_invite'),
	('role_org_admin', 'perm_member_remove'),
	('role_org_admin', 'perm_member_role'),
	('role_org_admin', 'perm_member_list'),
	('role_org_admin', 'perm_billing_view'),
	('role_org_member', 'perm_member_list'),
	('role_org_member', 'perm_billing_view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Helper Views
CREATE OR REPLACE VIEW user_organization_roles AS
SELECT
	om.id as membership_id,
	om.user_id,
	om.organization_id,
	o.name as organization_name,
	o.slug as organization_slug,
	om.role_id,
	r.name as role_name,
	r.key as role_key,
	om.joined_at,
	om.created_at
FROM organization_memberships om
JOIN organizations o ON om.organization_id = o.id
JOIN roles r ON om.role_id = r.id
WHERE o.status = 'active';

CREATE OR REPLACE VIEW organization_member_counts AS
SELECT
	organization_id,
	COUNT(*) as member_count
FROM organization_memberships
GROUP BY organization_id;

-- Cleanup Function
CREATE OR REPLACE FUNCTION cleanup_expired_invitations() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	UPDATE organization_invitations
	SET status = 'expired',
	    updated_at = NOW()
	WHERE status = 'pending'
	  AND expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;`,
		down: `-- Rollback Phase 4

DROP VIEW IF EXISTS organization_member_counts;
DROP VIEW IF EXISTS user_organization_roles;
DROP FUNCTION IF EXISTS cleanup_expired_invitations();
DROP TABLE IF EXISTS principal_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS organization_invitations;
DROP TABLE IF EXISTS organization_memberships;
DROP TABLE IF EXISTS organizations;`,
	},

	// ====================================================================
	// Billing, Entitlements, Webhooks
	// ====================================================================
	{
		id: '005',
		name: 'billing_entitlements_webhooks',
		up: `-- ====================================================================
-- Billing, Entitlements, Webhooks
-- ====================================================================

-- Features
CREATE TABLE IF NOT EXISTS features (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	key VARCHAR(100) UNIQUE NOT NULL,
	name VARCHAR(255) NOT NULL,
	description TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_features_key ON features(key);

-- Plans
CREATE TABLE IF NOT EXISTS plans (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	key VARCHAR(100) UNIQUE NOT NULL,
	name VARCHAR(255) NOT NULL,
	price_cents INT NOT NULL DEFAULT 0,
	description TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_key ON plans(key);

-- Plan Features (many-to-many)
CREATE TABLE IF NOT EXISTS plan_features (
	plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
	feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
	PRIMARY KEY (plan_id, feature_id)
);

-- Enhanced Subscriptions (user OR org)
CREATE TABLE IF NOT EXISTS subscriptions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
	org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
	plan_key VARCHAR(100) NOT NULL,
	status VARCHAR(50) NOT NULL DEFAULT 'active',
	current_period_end TIMESTAMPTZ NOT NULL,
	trial_ends_at TIMESTAMPTZ,
	cancel_at_period_end BOOLEAN DEFAULT false,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CHECK ((user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_key);

-- Subscription updated_at trigger
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
	BEFORE UPDATE ON subscriptions
	FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Entitlement Overrides
CREATE TABLE IF NOT EXISTS entitlement_overrides (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('user', 'org')),
	subject_id TEXT NOT NULL,
	feature_key VARCHAR(100) NOT NULL,
	override_type VARCHAR(20) NOT NULL CHECK (override_type IN ('grant', 'deny', 'limit')),
	limit_value INT,
	reason TEXT,
	org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE(subject_type, subject_id, feature_key, org_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlement_overrides_subject ON entitlement_overrides(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_overrides_feature ON entitlement_overrides(feature_key);
CREATE INDEX IF NOT EXISTS idx_entitlement_overrides_org ON entitlement_overrides(org_id);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
	user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
	url TEXT NOT NULL,
	events JSONB NOT NULL DEFAULT '[]',
	secret TEXT NOT NULL,
	enabled BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CHECK ((org_id IS NOT NULL AND user_id IS NULL) OR (org_id IS NULL AND user_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN(events);

-- Webhook updated_at trigger
DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at
	BEFORE UPDATE ON webhooks
	FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Webhook Events
CREATE TABLE IF NOT EXISTS webhook_events (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
	event_name VARCHAR(100) NOT NULL,
	payload JSONB NOT NULL,
	org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
	user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
	status VARCHAR(50) NOT NULL DEFAULT 'pending',
	attempts INT NOT NULL DEFAULT 0,
	response_code INT,
	response_body TEXT,
	error TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_attempt_at TIMESTAMPTZ,
	delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);

-- Seed default features
INSERT INTO features (key, name, description) VALUES
	('api:basic', 'Basic API Access', 'Access to basic API endpoints'),
	('api:advanced', 'Advanced API Access', 'Access to advanced API features'),
	('storage:10gb', 'Storage 10GB', 'Up to 10GB storage'),
	('storage:100gb', 'Storage 100GB', 'Up to 100GB storage'),
	('storage:unlimited', 'Unlimited Storage', 'Unlimited storage'),
	('team:5', 'Team up to 5', 'Up to 5 team members'),
	('team:25', 'Team up to 25', 'Up to 25 team members'),
	('team:unlimited', 'Unlimited Team', 'Unlimited team members'),
	('support:email', 'Email Support', 'Email support'),
	('support:priority', 'Priority Support', '24/7 priority support')
ON CONFLICT (key) DO NOTHING;

-- Seed default plans
INSERT INTO plans (key, name, price_cents, description) VALUES
	('free', 'Free', 0, 'Basic features for individuals'),
	('starter', 'Starter', 2900, 'For small teams getting started'),
	('pro', 'Pro', 9900, 'For growing teams'),
	('enterprise', 'Enterprise', 29900, 'For large organizations')
ON CONFLICT (key) DO NOTHING;

-- Link features to plans
INSERT INTO plan_features (plan_id, feature_id)
SELECT
	pl.id,
	f.id
FROM plans pl
CROSS JOIN features f
WHERE
	-- Free plan: basic API + 10GB storage + 5 members + email support
	(pl.key = 'free' AND f.key IN ('api:basic', 'storage:10gb', 'team:5', 'support:email')) OR
	-- Starter plan: advanced API + 100GB storage + 25 members + email support
	(pl.key = 'starter' AND f.key IN ('api:advanced', 'storage:100gb', 'team:25', 'support:email')) OR
	-- Pro plan: advanced API + unlimited storage + unlimited members + priority support
	(pl.key = 'pro' AND f.key IN ('api:advanced', 'storage:unlimited', 'team:unlimited', 'support:priority')) OR
	-- Enterprise plan: all features
	(pl.key = 'enterprise')
ON CONFLICT DO NOTHING;`,
		down: `-- Rollback Billing, Entitlements, Webhooks
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS entitlement_overrides;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plan_features;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS features;`,
	},
]

/**
 * Get combined SQL for all migrations
 */
export function getCombinedMigrationSQL(): string {
	return PLATFORM_MIGRATIONS.map((m) => `-- ${m.name}\n${m.up}`).join('\n\n')
}
