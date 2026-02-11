-- Migration: add_task_tags
-- Add tags support for tasks

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(7), -- Hex color code
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_tags (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);

-- Seed some default tags
INSERT INTO tags (name, color) VALUES
    ('urgent', '#FF0000'),
    ('bug', '#FF4444'),
    ('feature', '#00AA00'),
    ('enhancement', '#0088FF'),
    ('documentation', '#8800FF')
ON CONFLICT (name) DO NOTHING;
