-- AMANTRA Control Panel Database Schema

-- Super admin users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modules available in AMANTRA (Risk, Compliance, etc.)
CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance frameworks (PCI-DSS, ISO, SAMA, etc.)
CREATE TABLE IF NOT EXISTS frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'Standard', -- Standard, Custom
    status TEXT NOT NULL DEFAULT 'Active', -- Active, Archived
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Framework versions with JSON content
CREATE TABLE IF NOT EXISTS framework_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_id UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    content_json JSONB, -- Framework content as JSON
    content_file_path TEXT, -- Path to uploaded JSON file in storage
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(framework_id, version)
);

-- Client organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    employees INTEGER,
    address TEXT,
    type TEXT NOT NULL DEFAULT 'Cloud', -- Cloud, On-Premise
    logo_path TEXT, -- Path to uploaded logo in storage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization admin users
CREATE TABLE IF NOT EXISTS organization_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    invited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- Licenses for organizations
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    license_key TEXT UNIQUE NOT NULL,
    operational_users_limit INTEGER NOT NULL,
    frameworks_limit INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active', -- Active, Inactive, Revoked, Expired
    license_file_path TEXT, -- Path to generated license JSON in storage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- License modules (many-to-many: license <-> modules)
CREATE TABLE IF NOT EXISTS license_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(license_id, module_id)
);

-- AMANTRA product version registry
CREATE TABLE IF NOT EXISTS product_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_name TEXT UNIQUE NOT NULL, -- AMANTRA@1.2
    backend_version TEXT,
    frontend_version TEXT,
    ai_services_version TEXT,
    release_type TEXT NOT NULL DEFAULT 'Stable', -- Beta, Stable, Patch
    release_date TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification history
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES organization_admins(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- invite, license_expiry, license_generated, etc.
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'sent' -- sent, failed
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_framework_versions_framework_id ON framework_versions(framework_id);
CREATE INDEX IF NOT EXISTS idx_licenses_organization_id ON licenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_valid_until ON licenses(valid_until);
CREATE INDEX IF NOT EXISTS idx_license_modules_license_id ON license_modules(license_id);
CREATE INDEX IF NOT EXISTS idx_organization_admins_org_id ON organization_admins(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON notifications(organization_id);

-- Insert default modules
INSERT INTO modules (name, description) VALUES
    ('Risk', 'Risk management module'),
    ('Compliance', 'Compliance management module')
ON CONFLICT (name) DO NOTHING;

-- Insert initial super admin user (password: admin123 - CHANGE IN PRODUCTION)
-- Password hash for 'admin123' using bcrypt
INSERT INTO users (email, password_hash, name) VALUES
    ('admin@amantra.com', '$2a$10$rqMYvK8xQx5z5KZ5xZ5Z5OqXqXqXqXqXqXqXqXqXqXqXqXqXqXqXq', 'Super Admin')
ON CONFLICT (email) DO NOTHING;
