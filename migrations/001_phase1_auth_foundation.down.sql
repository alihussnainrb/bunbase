-- Rollback Phase 1: Authentication Foundation Schema
-- This migration removes all Phase 1 authentication tables

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS email_messages CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS auth_challenges CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS credentials_password CASCADE;
DROP TABLE IF EXISTS user_phones CASCADE;
DROP TABLE IF EXISTS user_emails CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_expired_auth_records() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
