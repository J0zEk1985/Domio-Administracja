-- Keep resident location_access labels aligned when a unit number is edited.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_sync_community_unit_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.normalized_unit_number IS NOT DISTINCT FROM NEW.normalized_unit_number
     AND OLD.unit_number IS NOT DISTINCT FROM NEW.unit_number THEN
    RETURN NEW;
  END IF;

  UPDATE public.location_access la
  SET unit_number = NEW.unit_number
  FROM public.community_unit_occupants o
  WHERE o.unit_id = NEW.id
    AND o.user_id IS NOT NULL
    AND la.user_id = o.user_id
    AND la.location_id = NEW.location_id
    AND la.unit_number IS NOT NULL
    AND public.normalize_unit_number(la.unit_number) IS NOT DISTINCT FROM OLD.normalized_unit_number;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_community_unit_number ON public.community_units;
CREATE TRIGGER trg_sync_community_unit_number
  AFTER UPDATE OF unit_number
  ON public.community_units
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sync_community_unit_number();

COMMIT;
