-- ====================================================================
-- Phase 2: OAuth Integration
-- ====================================================================

-- OAuth Provider Accounts
-- Links users to their OAuth provider accounts (Google, GitHub, etc.)
CREATE TABLE IF NOT EXISTS oauth_accounts (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	provider TEXT NOT NULL, -- 'google', 'github', 'microsoft', etc.
	provider_account_id TEXT NOT NULL, -- Provider's unique user ID

	-- OAuth tokens (encrypted at rest)
	access_token TEXT,
	refresh_token TEXT,
	token_type TEXT,
	expires_at TIMESTAMPTZ,
	scope TEXT,

	-- ID token (for OIDC providers)
	id_token TEXT,

	-- Provider profile data
	profile JSONB NOT NULL DEFAULT '{}',

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	-- Constraints
	UNIQUE(provider, provider_account_id)
);

-- Indexes for OAuth accounts
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_account ON oauth_accounts(provider, provider_account_id);

-- Updated_at trigger for oauth_accounts
CREATE TRIGGER trg_oauth_accounts_updated_at
	BEFORE UPDATE ON oauth_accounts
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- OAuth State Storage (CSRF Protection + PKCE)
-- ====================================================================

CREATE TABLE IF NOT EXISTS oauth_states (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- State for CSRF protection
	state TEXT NOT NULL UNIQUE,

	-- PKCE (Proof Key for Code Exchange)
	code_verifier TEXT NOT NULL,
	code_challenge TEXT NOT NULL,
	code_challenge_method TEXT NOT NULL DEFAULT 'S256', -- 'S256' or 'plain'

	-- OIDC nonce (for ID token validation)
	nonce TEXT,

	-- Provider
	provider TEXT NOT NULL,

	-- Redirect URI
	redirect_uri TEXT NOT NULL,

	-- Optional: Store return URL for post-auth redirect
	return_to TEXT,

	-- Expiration
	expires_at TIMESTAMPTZ NOT NULL,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for state lookup
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- ====================================================================
-- Cleanup Function for OAuth States
-- ====================================================================

-- Clean up expired OAuth states (call periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states() RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM oauth_states WHERE expires_at < NOW();
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
