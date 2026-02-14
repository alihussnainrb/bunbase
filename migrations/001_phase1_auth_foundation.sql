-- Phase 1: Authentication Foundation Schema
-- This migration creates the core authentication tables for ctx.platform.auth
-- Includes: users, sessions, credentials, email templates, and challenges

-- ====================================================================
-- USERS TABLE (Enhanced)
-- ====================================================================
-- Core user identity with status tracking and metadata support

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Primary identifier (email is most common, but phone can be primary too)
  email TEXT UNIQUE,
  phone TEXT UNIQUE,

  -- Profile information
  name TEXT,
  avatar_url TEXT,

  -- User status (active, suspended, deleted, invited)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted', 'invited')),

  -- Email verification
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,

  -- Extensible metadata for custom fields (JSONB for flexibility)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,

  -- Soft delete timestamp
  deleted_at TIMESTAMPTZ
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users(created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Core user identity table with status tracking and verification';
COMMENT ON COLUMN users.status IS 'User account status: active, suspended, deleted, invited';
COMMENT ON COLUMN users.metadata IS 'Extensible JSONB field for custom user attributes';

-- ====================================================================
-- USER_EMAILS TABLE (Secondary email addresses)
-- ====================================================================
-- Allows users to have multiple email addresses

CREATE TABLE IF NOT EXISTS user_emails (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure email is unique across all users
  UNIQUE(email),
  -- Ensure only one primary email per user
  UNIQUE(user_id, is_primary) WHERE is_primary = TRUE
);

CREATE INDEX idx_user_emails_user_id ON user_emails(user_id);
CREATE INDEX idx_user_emails_email ON user_emails(email);

COMMENT ON TABLE user_emails IS 'Secondary email addresses for users (for account recovery, notifications)';

-- ====================================================================
-- USER_PHONES TABLE (Secondary phone numbers)
-- ====================================================================
-- Allows users to have multiple phone numbers

CREATE TABLE IF NOT EXISTS user_phones (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  phone TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure phone is unique across all users
  UNIQUE(phone),
  -- Ensure only one primary phone per user
  UNIQUE(user_id, is_primary) WHERE is_primary = TRUE
);

CREATE INDEX idx_user_phones_user_id ON user_phones(user_id);
CREATE INDEX idx_user_phones_phone ON user_phones(phone);

COMMENT ON TABLE user_phones IS 'Secondary phone numbers for users (for MFA, SMS notifications)';

-- ====================================================================
-- CREDENTIALS_PASSWORD TABLE
-- ====================================================================
-- Password credentials stored separately from users for security

CREATE TABLE IF NOT EXISTS credentials_password (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Argon2id hashed password
  password_hash TEXT NOT NULL,

  -- Password change tracking
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credentials_password_user_id ON credentials_password(user_id);

COMMENT ON TABLE credentials_password IS 'Password credentials (Argon2id hashed) stored separately from users';
COMMENT ON COLUMN credentials_password.password_hash IS 'Argon2id hash via Bun.password.hash()';

-- ====================================================================
-- AUTH_SESSIONS TABLE (Database-backed sessions)
-- ====================================================================
-- Enables session revocation and tracking

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session token hash (SHA-256) for lookup
  token_hash TEXT NOT NULL UNIQUE,

  -- Session metadata
  ip_address TEXT,
  user_agent TEXT,

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,

  -- Tracking
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Revocation
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

-- Indexes for auth_sessions
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX idx_auth_sessions_revoked_at ON auth_sessions(revoked_at);

COMMENT ON TABLE auth_sessions IS 'Database-backed sessions for revocation and tracking';
COMMENT ON COLUMN auth_sessions.token_hash IS 'SHA-256 hash of session token for secure lookup';

-- ====================================================================
-- AUTH_CHALLENGES TABLE (Verification & OTP)
-- ====================================================================
-- Handles email verification, password reset, and OTP challenges

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Challenge type: email_verification, password_reset, otp_email, otp_sms
  type TEXT NOT NULL CHECK (type IN ('email_verification', 'password_reset', 'otp_email', 'otp_sms')),

  -- Target identifier (email or phone)
  identifier TEXT NOT NULL,

  -- User reference (NULL for signup challenges)
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,

  -- Secure token hash (SHA-256)
  token_hash TEXT NOT NULL UNIQUE,

  -- OTP code (for OTP challenges, NULL for token-based)
  code_hash TEXT,

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,

  -- Attempt tracking (for rate limiting)
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,

  -- Completion
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for auth_challenges
CREATE INDEX idx_auth_challenges_type ON auth_challenges(type);
CREATE INDEX idx_auth_challenges_identifier ON auth_challenges(identifier);
CREATE INDEX idx_auth_challenges_token_hash ON auth_challenges(token_hash);
CREATE INDEX idx_auth_challenges_user_id ON auth_challenges(user_id);
CREATE INDEX idx_auth_challenges_expires_at ON auth_challenges(expires_at);

COMMENT ON TABLE auth_challenges IS 'Email verification, password reset, and OTP challenges';
COMMENT ON COLUMN auth_challenges.token_hash IS 'SHA-256 hash of secure token';
COMMENT ON COLUMN auth_challenges.code_hash IS 'SHA-256 hash of OTP code (for email/SMS OTP)';

-- ====================================================================
-- EMAIL_TEMPLATES TABLE
-- ====================================================================
-- Reusable email templates with variable substitution

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Template identifier (e.g., "auth-verify-email", "auth-password-reset")
  key TEXT NOT NULL UNIQUE,

  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Email content
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,

  -- Variables used in template (for documentation)
  -- Example: ["userName", "verificationUrl", "expiresIn"]
  variables JSONB NOT NULL DEFAULT '[]',

  -- Active status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_templates_key ON email_templates(key);
CREATE INDEX idx_email_templates_is_active ON email_templates(is_active);

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE email_templates IS 'Reusable email templates with variable substitution';
COMMENT ON COLUMN email_templates.key IS 'Unique template identifier (e.g., "auth-verify-email")';
COMMENT ON COLUMN email_templates.variables IS 'Array of variable names used in template';

-- ====================================================================
-- EMAIL_MESSAGES TABLE
-- ====================================================================
-- Tracks sent emails for audit and retry

CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

  -- Template reference
  template_id TEXT REFERENCES email_templates(id) ON DELETE SET NULL,

  -- User reference (optional)
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Email details
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,

  -- Delivery tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Retry tracking
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- External provider tracking
  provider_message_id TEXT,
  provider_metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_messages
CREATE INDEX idx_email_messages_user_id ON email_messages(user_id);
CREATE INDEX idx_email_messages_template_id ON email_messages(template_id);
CREATE INDEX idx_email_messages_to_email ON email_messages(to_email);
CREATE INDEX idx_email_messages_status ON email_messages(status);
CREATE INDEX idx_email_messages_sent_at ON email_messages(sent_at);
CREATE INDEX idx_email_messages_next_retry_at ON email_messages(next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;

COMMENT ON TABLE email_messages IS 'Tracks sent emails for audit, retry, and delivery status';
COMMENT ON COLUMN email_messages.provider_message_id IS 'External email provider message ID (e.g., SendGrid, Resend)';

-- ====================================================================
-- DEFAULT EMAIL TEMPLATES
-- ====================================================================
-- Seed default templates for Phase 1

-- Email Verification Template
INSERT INTO email_templates (key, name, description, subject, html_body, text_body, variables)
VALUES (
  'auth-verify-email',
  'Email Verification',
  'Email verification for new user signups',
  'Verify your email address',
  '<h1>Verify Your Email</h1>
<p>Hi {{userName}},</p>
<p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
<p><a href="{{verificationUrl}}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{verificationUrl}}</p>
<p>This link will expire in {{expiresIn}}.</p>
<p>If you didn''t create an account, you can safely ignore this email.</p>',
  'Hi {{userName}},

Thank you for signing up! Please verify your email address by clicking the link below:

{{verificationUrl}}

This link will expire in {{expiresIn}}.

If you didn''t create an account, you can safely ignore this email.',
  '["userName", "verificationUrl", "expiresIn"]'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Password Reset Template
INSERT INTO email_templates (key, name, description, subject, html_body, text_body, variables)
VALUES (
  'auth-password-reset',
  'Password Reset',
  'Password reset request email',
  'Reset your password',
  '<h1>Reset Your Password</h1>
<p>Hi {{userName}},</p>
<p>We received a request to reset your password. Click the link below to create a new password:</p>
<p><a href="{{resetUrl}}" style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{resetUrl}}</p>
<p>This link will expire in {{expiresIn}}.</p>
<p>If you didn''t request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>',
  'Hi {{userName}},

We received a request to reset your password. Click the link below to create a new password:

{{resetUrl}}

This link will expire in {{expiresIn}}.

If you didn''t request a password reset, you can safely ignore this email. Your password will remain unchanged.',
  '["userName", "resetUrl", "expiresIn"]'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- ====================================================================
-- CLEANUP FUNCTION FOR EXPIRED RECORDS
-- ====================================================================
-- Call this periodically to clean up expired challenges and sessions

CREATE OR REPLACE FUNCTION cleanup_expired_auth_records()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- Clean up expired, unverified challenges (keep verified ones for audit)
  DELETE FROM auth_challenges
  WHERE expires_at < NOW()
    AND verified_at IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Clean up expired sessions
  DELETE FROM auth_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_auth_records IS 'Removes expired auth challenges and sessions';

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================
-- Phase 1 schema is now ready for ctx.platform.auth implementation
