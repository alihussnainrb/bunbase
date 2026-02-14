-- ====================================================================
-- Phase 3: OTP + TOTP MFA
-- ====================================================================

-- ====================================================================
-- OTP Codes (One-Time Passwords via Email/SMS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS otp_codes (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Challenge reference
	challenge_id TEXT NOT NULL REFERENCES auth_challenges(id) ON DELETE CASCADE,

	-- OTP delivery
	delivery_method TEXT NOT NULL, -- 'email' or 'sms'
	recipient TEXT NOT NULL, -- Email address or phone number

	-- Code (hashed with SHA-256)
	code_hash TEXT NOT NULL,

	-- Security
	attempts INT NOT NULL DEFAULT 0,
	max_attempts INT NOT NULL DEFAULT 5,

	-- Expiration (typically 5 minutes)
	expires_at TIMESTAMPTZ NOT NULL,

	-- Verification
	verified_at TIMESTAMPTZ,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for OTP codes
CREATE INDEX IF NOT EXISTS idx_otp_codes_challenge_id ON otp_codes(challenge_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_recipient ON otp_codes(recipient);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);

-- ====================================================================
-- MFA Factors (TOTP Authenticators)
-- ====================================================================

CREATE TABLE IF NOT EXISTS mfa_factors (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- User
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

	-- Factor type
	type TEXT NOT NULL, -- 'totp' (time-based OTP)

	-- Factor metadata
	name TEXT, -- User-friendly name (e.g., "Google Authenticator", "Authy")

	-- TOTP secret (encrypted at rest)
	secret TEXT NOT NULL,

	-- TOTP configuration
	algorithm TEXT NOT NULL DEFAULT 'SHA1', -- 'SHA1', 'SHA256', 'SHA512'
	digits INT NOT NULL DEFAULT 6, -- Number of digits in code (6 or 8)
	period INT NOT NULL DEFAULT 30, -- Time step in seconds

	-- Status
	status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'disabled'

	-- Enrollment challenge (for verification during setup)
	enrollment_challenge_id TEXT REFERENCES auth_challenges(id) ON DELETE SET NULL,

	-- Verification
	verified_at TIMESTAMPTZ,
	last_used_at TIMESTAMPTZ,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for MFA factors
CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_id ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_status ON mfa_factors(status);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_type ON mfa_factors(type);

-- Updated_at trigger for mfa_factors
CREATE TRIGGER trg_mfa_factors_updated_at
	BEFORE UPDATE ON mfa_factors
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- MFA Backup Codes
-- ====================================================================

CREATE TABLE IF NOT EXISTS mfa_backup_codes (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- User
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

	-- Backup code (hashed with SHA-256)
	code_hash TEXT NOT NULL UNIQUE,

	-- Usage
	used_at TIMESTAMPTZ,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for MFA backup codes
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_code_hash ON mfa_backup_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_used_at ON mfa_backup_codes(used_at);

-- ====================================================================
-- Step-Up Authentication Sessions
-- ====================================================================

CREATE TABLE IF NOT EXISTS stepup_sessions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- User and session
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,

	-- Step-up authentication method
	method TEXT NOT NULL, -- 'password', 'totp', 'backup_code'

	-- Expiration (typically 15-30 minutes for sensitive operations)
	expires_at TIMESTAMPTZ NOT NULL,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for step-up sessions
CREATE INDEX IF NOT EXISTS idx_stepup_sessions_user_id ON stepup_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_stepup_sessions_session_id ON stepup_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_stepup_sessions_expires_at ON stepup_sessions(expires_at);

-- ====================================================================
-- Cleanup Functions
-- ====================================================================

-- Clean up expired OTP codes (call periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM otp_codes WHERE expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up expired step-up sessions (call periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_stepup_sessions() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM stepup_sessions WHERE expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- Helper Views
-- ====================================================================

-- Active MFA factors for users
CREATE OR REPLACE VIEW user_active_mfa_factors AS
SELECT
	user_id,
	COUNT(*) as active_factor_count,
	BOOL_OR(type = 'totp') as has_totp
FROM mfa_factors
WHERE status = 'active'
GROUP BY user_id;

-- Users with MFA enabled
CREATE OR REPLACE VIEW users_with_mfa AS
SELECT DISTINCT user_id
FROM mfa_factors
WHERE status = 'active';
