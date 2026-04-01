-- =============================================================================
-- Guest portals: secure token URLs on cleaning_locations (board + public report)
-- =============================================================================
-- Deploy: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

ALTER TABLE public.cleaning_locations
  ADD COLUMN IF NOT EXISTS board_portal_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.cleaning_locations
  ADD COLUMN IF NOT EXISTS public_report_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaning_locations_board_portal_token_unique
  ON public.cleaning_locations (board_portal_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaning_locations_public_report_token_unique
  ON public.cleaning_locations (public_report_token);

COMMENT ON COLUMN public.cleaning_locations.board_portal_token IS
  'Opaque UUID for /portal/board/:token (guest board portal). Rotate on leak.';

COMMENT ON COLUMN public.cleaning_locations.public_report_token IS
  'Opaque UUID for /portal/report/:token (resident issue form). Rotate on leak.';
