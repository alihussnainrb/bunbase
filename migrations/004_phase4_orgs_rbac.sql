-- ====================================================================
-- Phase 4: Organizations + RBAC
-- ====================================================================

-- ====================================================================
-- Organizations
-- ====================================================================

CREATE TABLE IF NOT EXISTS organizations (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Organization details
	name TEXT NOT NULL,
	slug TEXT UNIQUE NOT NULL, -- URL-friendly identifier
	description TEXT,
	logo_url TEXT,

	-- Owner
	owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

	-- Settings
	settings JSONB NOT NULL DEFAULT '{}',
	metadata JSONB NOT NULL DEFAULT '{}',

	-- Status
	status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'deleted'

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for organizations
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- Updated_at trigger for organizations
CREATE TRIGGER trg_organizations_updated_at
	BEFORE UPDATE ON organizations
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Organization Memberships
-- ====================================================================

CREATE TABLE IF NOT EXISTS organization_memberships (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Organization and user
	organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

	-- Role in organization (references roles table)
	role_id TEXT NOT NULL, -- Will reference roles table created below

	-- Invitation tracking
	invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
	invitation_id TEXT, -- Will reference organization_invitations

	-- Timestamps
	joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	-- Unique constraint: One membership per user per org
	UNIQUE(organization_id, user_id)
);

-- Indexes for memberships
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_role_id ON organization_memberships(role_id);

-- Updated_at trigger for memberships
CREATE TRIGGER trg_org_memberships_updated_at
	BEFORE UPDATE ON organization_memberships
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- Organization Invitations
-- ====================================================================

CREATE TABLE IF NOT EXISTS organization_invitations (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Organization
	organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

	-- Invitee
	email TEXT NOT NULL,
	role_id TEXT NOT NULL, -- Will reference roles table

	-- Invitation metadata
	invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	message TEXT,

	-- Token (hashed with SHA-256)
	token_hash TEXT NOT NULL UNIQUE,

	-- Status
	status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'revoked'
	accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
	accepted_at TIMESTAMPTZ,

	-- Expiration (typically 7 days)
	expires_at TIMESTAMPTZ NOT NULL,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for invitations
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token_hash ON organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_org_invitations_status ON organization_invitations(status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_expires_at ON organization_invitations(expires_at);

-- Updated_at trigger for invitations
CREATE TRIGGER trg_org_invitations_updated_at
	BEFORE UPDATE ON organization_invitations
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- RBAC: Roles
-- ====================================================================

CREATE TABLE IF NOT EXISTS roles (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Role details
	name TEXT NOT NULL,
	description TEXT,
	key TEXT NOT NULL, -- System key (e.g., 'org_owner', 'org_admin', 'org_member')

	-- Scope
	scope TEXT NOT NULL, -- 'global', 'organization', 'custom'
	organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE, -- NULL for global/system roles

	-- System roles cannot be deleted
	is_system BOOLEAN NOT NULL DEFAULT FALSE,

	-- Metadata
	metadata JSONB NOT NULL DEFAULT '{}',

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	-- Unique constraint for role keys within scope
	UNIQUE(key, organization_id)
);

-- Indexes for roles
CREATE INDEX IF NOT EXISTS idx_roles_key ON roles(key);
CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope);
CREATE INDEX IF NOT EXISTS idx_roles_org_id ON roles(organization_id);

-- Updated_at trigger for roles
CREATE TRIGGER trg_roles_updated_at
	BEFORE UPDATE ON roles
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- RBAC: Permissions
-- ====================================================================

CREATE TABLE IF NOT EXISTS permissions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Permission details
	name TEXT NOT NULL,
	description TEXT,
	key TEXT NOT NULL UNIQUE, -- System key (e.g., 'org:member:invite', 'billing:manage')

	-- Resource and action
	resource TEXT NOT NULL, -- e.g., 'organization', 'billing', 'member'
	action TEXT NOT NULL, -- e.g., 'create', 'read', 'update', 'delete', 'manage'

	-- Metadata
	metadata JSONB NOT NULL DEFAULT '{}',

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for permissions
CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(key);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

-- Updated_at trigger for permissions
CREATE TRIGGER trg_permissions_updated_at
	BEFORE UPDATE ON permissions
	FOR EACH ROW
	EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- RBAC: Role-Permission Assignments
-- ====================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Role and permission
	role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
	permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

	-- Timestamps
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	-- Unique constraint: One permission per role
	UNIQUE(role_id, permission_id)
);

-- Indexes for role permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ====================================================================
-- RBAC: Principal Role Assignments (User/Org specific roles)
-- ====================================================================

CREATE TABLE IF NOT EXISTS principal_roles (
	id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,

	-- Principal (who the role is assigned to)
	principal_type TEXT NOT NULL, -- 'user', 'organization'
	principal_id TEXT NOT NULL, -- User ID or Organization ID

	-- Role
	role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

	-- Context (where the role applies)
	context_type TEXT, -- NULL for global, 'organization' for org-specific
	context_id TEXT, -- NULL for global, organization ID for org-specific

	-- Granted by
	granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,

	-- Timestamps
	granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	-- Unique constraint: One role per principal in each context
	UNIQUE(principal_type, principal_id, role_id, context_type, context_id)
);

-- Indexes for principal roles
CREATE INDEX IF NOT EXISTS idx_principal_roles_principal ON principal_roles(principal_type, principal_id);
CREATE INDEX IF NOT EXISTS idx_principal_roles_role_id ON principal_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_principal_roles_context ON principal_roles(context_type, context_id);

-- ====================================================================
-- Seed Default Roles and Permissions
-- ====================================================================

-- Seed system roles
INSERT INTO roles (id, name, description, key, scope, is_system) VALUES
	('role_org_owner', 'Organization Owner', 'Full control over the organization', 'org_owner', 'organization', true),
	('role_org_admin', 'Organization Admin', 'Administrative access to the organization', 'org_admin', 'organization', true),
	('role_org_member', 'Organization Member', 'Basic member access', 'org_member', 'organization', true);

-- Seed permissions
INSERT INTO permissions (id, name, description, key, resource, action) VALUES
	-- Organization permissions
	('perm_org_update', 'Update Organization', 'Update organization details', 'org:update', 'organization', 'update'),
	('perm_org_delete', 'Delete Organization', 'Delete the organization', 'org:delete', 'organization', 'delete'),
	('perm_org_settings', 'Manage Organization Settings', 'Manage organization settings', 'org:settings:manage', 'organization', 'manage'),

	-- Member permissions
	('perm_member_invite', 'Invite Members', 'Invite new members to the organization', 'member:invite', 'member', 'create'),
	('perm_member_remove', 'Remove Members', 'Remove members from the organization', 'member:remove', 'member', 'delete'),
	('perm_member_role', 'Manage Member Roles', 'Update member roles', 'member:role:update', 'member', 'update'),
	('perm_member_list', 'List Members', 'View organization members', 'member:list', 'member', 'read'),

	-- Billing permissions
	('perm_billing_manage', 'Manage Billing', 'Manage billing and subscriptions', 'billing:manage', 'billing', 'manage'),
	('perm_billing_view', 'View Billing', 'View billing information', 'billing:view', 'billing', 'read');

-- Assign permissions to roles

-- Owner: All permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
	('role_org_owner', 'perm_org_update'),
	('role_org_owner', 'perm_org_delete'),
	('role_org_owner', 'perm_org_settings'),
	('role_org_owner', 'perm_member_invite'),
	('role_org_owner', 'perm_member_remove'),
	('role_org_owner', 'perm_member_role'),
	('role_org_owner', 'perm_member_list'),
	('role_org_owner', 'perm_billing_manage'),
	('role_org_owner', 'perm_billing_view');

-- Admin: Most permissions except delete org
INSERT INTO role_permissions (role_id, permission_id) VALUES
	('role_org_admin', 'perm_org_update'),
	('role_org_admin', 'perm_org_settings'),
	('role_org_admin', 'perm_member_invite'),
	('role_org_admin', 'perm_member_remove'),
	('role_org_admin', 'perm_member_role'),
	('role_org_admin', 'perm_member_list'),
	('role_org_admin', 'perm_billing_view');

-- Member: Read-only permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
	('role_org_member', 'perm_member_list'),
	('role_org_member', 'perm_billing_view');

-- ====================================================================
-- Helper Views
-- ====================================================================

-- User organization memberships with role details
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

-- Organization member counts
CREATE OR REPLACE VIEW organization_member_counts AS
SELECT
	organization_id,
	COUNT(*) as member_count
FROM organization_memberships
GROUP BY organization_id;

-- ====================================================================
-- Cleanup Functions
-- ====================================================================

-- Clean up expired invitations (call periodically)
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
$$ LANGUAGE plpgsql;
