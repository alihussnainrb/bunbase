/**
 * Embedded initial schema SQL for `bunbase init` scaffolding.
 * This avoids filesystem reads from the bundled package.
 * Includes full SaaS schema: organizations, roles, permissions, plans, features, subscriptions.
 */
export const INIT_SQL = `-- Bunbase Initial Schema Migration
-- Run this against your PostgreSQL database to create all required tables.

-- ============================================================================
-- Users & Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE,
    phone VARCHAR(50) UNIQUE,
    name VARCHAR(255),
    password_hash TEXT NOT NULL,
    role VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email_verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================================
-- Organizations & Memberships
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);

CREATE TABLE IF NOT EXISTS org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);

CREATE TABLE IF NOT EXISTS org_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    invited_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);

-- ============================================================================
-- Roles & Permissions (RBAC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    weight INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ============================================================================
-- Plans & Features (SaaS Billing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS plan_features (
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, feature_id)
);

-- ============================================================================
-- Subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_key VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================================================
-- Action Runs & Logs (Observability)
-- ============================================================================

CREATE TABLE IF NOT EXISTS action_runs (
    id VARCHAR(255) PRIMARY KEY,
    action_name VARCHAR(255) NOT NULL,
    module_name VARCHAR(255),
    trace_id VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    input JSONB,
    output JSONB,
    error TEXT,
    error_stack TEXT,
    duration_ms INT NOT NULL DEFAULT 0,
    attempt INT,
    max_attempts INT,
    started_at BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_runs_action ON action_runs(action_name);
CREATE INDEX IF NOT EXISTS idx_action_runs_status ON action_runs(status);
CREATE INDEX IF NOT EXISTS idx_action_runs_trace ON action_runs(trace_id);
CREATE INDEX IF NOT EXISTS idx_action_runs_started ON action_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(255) NOT NULL REFERENCES action_runs(id) ON DELETE CASCADE,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    meta JSONB,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_logs_run ON action_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_level ON action_logs(level);

-- ============================================================================
-- Job Queue & Failures
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    trace_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_poll ON job_queue(status, run_at, priority DESC);
CREATE INDEX IF NOT EXISTS idx_job_queue_name ON job_queue(name);
CREATE INDEX IF NOT EXISTS idx_job_queue_trace ON job_queue(trace_id);

CREATE TABLE IF NOT EXISTS job_failures (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    error TEXT NOT NULL,
    attempts INT NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trace_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_job_failures_name ON job_failures(name);
CREATE INDEX IF NOT EXISTS idx_job_failures_failed_at ON job_failures(failed_at);

-- ============================================================================
-- Key-Value Store
-- ============================================================================

CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kv_store_expires ON kv_store(expires_at)
    WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Seed Data: Roles, Permissions, Plans, Features
-- ============================================================================

-- Insert default roles (similar to Clerk's org roles)
-- Weight determines role hierarchy: higher weight = more power (admin=100, member=10)
INSERT INTO roles (key, name, description, weight) VALUES
    ('org:admin', 'Organization Admin', 'Full administrative access to the organization', 100),
    ('org:billing_manager', 'Billing Manager', 'Can manage billing and subscriptions', 50),
    ('org:member', 'Organization Member', 'Standard member with read access', 10)
ON CONFLICT (key) DO NOTHING;

-- Insert default permissions (similar to Clerk's permission system)
INSERT INTO permissions (key, name, description) VALUES
    ('org:read', 'Read Organization', 'View organization details'),
    ('org:update', 'Update Organization', 'Modify organization settings'),
    ('org:delete', 'Delete Organization', 'Delete the organization'),
    ('org:members:read', 'Read Members', 'View organization members'),
    ('org:members:manage', 'Manage Members', 'Add/remove/update members'),
    ('org:invitations:manage', 'Manage Invitations', 'Send and manage invitations'),
    ('org:billing:read', 'Read Billing', 'View billing information'),
    ('org:billing:manage', 'Manage Billing', 'Update billing and subscriptions'),
    ('org:roles:manage', 'Manage Roles', 'Assign roles to members')
ON CONFLICT (key) DO NOTHING;

-- Link permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM roles r
CROSS JOIN permissions p
WHERE
    -- org:admin gets all permissions
    (r.key = 'org:admin') OR
    -- org:member gets read-only permissions
    (r.key = 'org:member' AND p.key IN ('org:read', 'org:members:read')) OR
    -- org:billing_manager gets billing + read permissions
    (r.key = 'org:billing_manager' AND p.key IN ('org:read', 'org:members:read', 'org:billing:read', 'org:billing:manage'))
ON CONFLICT DO NOTHING;

-- Insert default plans
INSERT INTO plans (key, name, price_cents) VALUES
    ('free', 'Free', 0),
    ('starter', 'Starter', 2900),
    ('pro', 'Pro', 9900),
    ('enterprise', 'Enterprise', 29900)
ON CONFLICT (key) DO NOTHING;

-- Insert default features
INSERT INTO features (key, name, description) VALUES
    ('org:basic', 'Basic Organization', 'Create and manage a single organization'),
    ('org:members:5', 'Up to 5 Members', 'Up to 5 team members'),
    ('org:members:25', 'Up to 25 Members', 'Up to 25 team members'),
    ('org:members:unlimited', 'Unlimited Members', 'Unlimited team members'),
    ('org:analytics', 'Analytics', 'Advanced analytics and insights'),
    ('org:api_access', 'API Access', 'Programmatic API access'),
    ('org:sso', 'Single Sign-On', 'SSO authentication'),
    ('org:priority_support', 'Priority Support', '24/7 priority support')
ON CONFLICT (key) DO NOTHING;

-- Link features to plans
INSERT INTO plan_features (plan_id, feature_id)
SELECT
    pl.id,
    f.id
FROM plans pl
CROSS JOIN features f
WHERE
    -- Free plan: basic org + 5 members
    (pl.key = 'free' AND f.key IN ('org:basic', 'org:members:5')) OR
    -- Starter plan: basic + 25 members + analytics
    (pl.key = 'starter' AND f.key IN ('org:basic', 'org:members:25', 'org:analytics')) OR
    -- Pro plan: starter features + API access + unlimited members
    (pl.key = 'pro' AND f.key IN ('org:basic', 'org:members:unlimited', 'org:analytics', 'org:api_access')) OR
    -- Enterprise plan: all features
    (pl.key = 'enterprise')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Trigger Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_organizations_timestamp ON organizations;
CREATE TRIGGER update_organizations_timestamp
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_subscriptions_timestamp ON subscriptions;
CREATE TRIGGER update_subscriptions_timestamp
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_job_queue_timestamp ON job_queue;
CREATE TRIGGER update_job_queue_timestamp
    BEFORE UPDATE ON job_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`
