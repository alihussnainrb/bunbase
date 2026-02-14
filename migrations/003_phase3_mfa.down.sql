-- Rollback Phase 3: OTP + TOTP MFA

-- Drop views
DROP VIEW IF EXISTS users_with_mfa;
DROP VIEW IF EXISTS user_active_mfa_factors;

-- Drop cleanup functions
DROP FUNCTION IF EXISTS cleanup_expired_stepup_sessions();
DROP FUNCTION IF EXISTS cleanup_expired_otp_codes();

-- Drop tables (in reverse order)
DROP TABLE IF EXISTS stepup_sessions;
DROP TABLE IF EXISTS mfa_backup_codes;
DROP TABLE IF EXISTS mfa_factors;
DROP TABLE IF EXISTS otp_codes;
