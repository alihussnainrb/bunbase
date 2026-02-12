-- Add error_stack column to action_runs table for better debugging
-- This stores the full stack trace of errors, not just the message

ALTER TABLE action_runs
ADD COLUMN IF NOT EXISTS error_stack TEXT;

-- Also add missing attempt and max_attempts columns for retry tracking
ALTER TABLE action_runs
ADD COLUMN IF NOT EXISTS attempt INT;

ALTER TABLE action_runs
ADD COLUMN IF NOT EXISTS max_attempts INT;
