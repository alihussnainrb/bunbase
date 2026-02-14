-- Rollback Phase 4: Organizations + RBAC

-- Drop views
DROP VIEW IF EXISTS organization_member_counts;
DROP VIEW IF EXISTS user_organization_roles;

-- Drop cleanup function
DROP FUNCTION IF EXISTS cleanup_expired_invitations();

-- Drop tables (in reverse order)
DROP TABLE IF EXISTS principal_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS organization_invitations;
DROP TABLE IF EXISTS organization_memberships;
DROP TABLE IF EXISTS organizations;
