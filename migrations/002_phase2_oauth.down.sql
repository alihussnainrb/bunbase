-- Rollback Phase 2: OAuth Integration

-- Drop cleanup function
DROP FUNCTION IF EXISTS cleanup_expired_oauth_states();

-- Drop tables (in reverse order)
DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS oauth_accounts;
