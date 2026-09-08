-- New queue status: ticket is inside DOMIO Cleaning and not yet handed off.
-- Must be a separate migration from uses of 'pending_cleaning_review'
-- (enum value is only usable after COMMIT).

ALTER TYPE public.issue_status_enum
  ADD VALUE IF NOT EXISTS 'pending_cleaning_review';
