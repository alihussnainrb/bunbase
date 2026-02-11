-- Job Queue Schema for Bunbase Phase 5

-- Main job queue table
CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, retrying
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_error TEXT,
    trace_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for efficient polling (status + run_at for pending jobs, priority for ordering)
CREATE INDEX IF NOT EXISTS idx_job_queue_poll ON job_queue(status, run_at, priority DESC);

-- Index for looking up jobs by name
CREATE INDEX IF NOT EXISTS idx_job_queue_name ON job_queue(name);

-- Index for trace correlation
CREATE INDEX IF NOT EXISTS idx_job_queue_trace ON job_queue(trace_id);

-- Dead letter queue for permanently failed jobs
CREATE TABLE IF NOT EXISTS job_failures (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    error TEXT NOT NULL,
    attempts INT NOT NULL,
    failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    trace_id VARCHAR(255)
);

-- Index for dead letter queue lookups
CREATE INDEX IF NOT EXISTS idx_job_failures_name ON job_failures(name);
CREATE INDEX IF NOT EXISTS idx_job_failures_failed_at ON job_failures(failed_at);

-- Function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_job_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_job_queue_timestamp ON job_queue;
CREATE TRIGGER update_job_queue_timestamp
    BEFORE UPDATE ON job_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_job_queue_updated_at();
