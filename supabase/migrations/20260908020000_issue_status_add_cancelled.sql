-- New terminal status: cancel after a technician claimed the job, before work started.
-- Must be a separate migration from uses of 'cancelled' (enum value visible after COMMIT).

ALTER TYPE public.issue_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
