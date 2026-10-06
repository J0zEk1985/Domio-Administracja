BEGIN;

-- Administracja tickets stay in Admin until accepted/assigned/broadcast (status leaves `new`).
-- Cleaning queue isolation is unchanged (released_from_cleaning_at).

CREATE OR REPLACE FUNCTION public.issue_is_visible_to_serwis(
  p_source public.issue_source_enum,
  p_released_at timestamptz,
  p_status public.issue_status_enum,
  p_reporter_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IS DISTINCT FROM 'pending_cleaning_review'::public.issue_status_enum
    AND p_status IS DISTINCT FROM 'pending_admin_approval'::public.issue_status_enum
    AND NOT public.issue_is_in_cleaning_queue(p_source, p_released_at, p_reporter_type)
    AND NOT (
      p_source = 'admin_ui'::public.issue_source_enum
      AND p_status = 'new'::public.issue_status_enum
    )
    AND NOT (
      p_status = 'new'::public.issue_status_enum
      AND p_source IS DISTINCT FROM 'dispatcher'::public.issue_source_enum
      AND p_source IS DISTINCT FROM 'serwis'::public.issue_source_enum
    );
$$;

COMMENT ON FUNCTION public.issue_is_visible_to_serwis(
  public.issue_source_enum, timestamptz, public.issue_status_enum, text
) IS
  'False for Cleaning-internal, Administracja-pending, and unsent Admin tickets (admin_ui/new).';

COMMIT;
