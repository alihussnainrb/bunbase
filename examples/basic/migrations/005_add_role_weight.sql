-- Add weight column to roles table for role hierarchy
-- Higher weight = more powerful role (e.g., admin=100, member=10)

ALTER TABLE roles
ADD COLUMN IF NOT EXISTS weight INT NOT NULL DEFAULT 0;

-- Update existing roles with appropriate weights
UPDATE roles SET weight = 100 WHERE key = 'org:admin';
UPDATE roles SET weight = 50 WHERE key = 'org:billing_manager';
UPDATE roles SET weight = 10 WHERE key = 'org:member';
