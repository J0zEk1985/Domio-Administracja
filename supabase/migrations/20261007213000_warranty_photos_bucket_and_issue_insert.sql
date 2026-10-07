-- =============================================================================
-- Usterki deweloperskie: zapis i zdjęcia
--
-- 1. Bucket warranty-photos nie istniał, więc upload kończył się
--    "Nie udało się przesłać <plik>".
-- 2. Panel pomijał org_id (user_metadata.org_id nie jest ustawiane),
--    a kolumna jest NOT NULL i sprawdzana przez RLS.
-- 3. Formularz wysyłał cleaning_locations.id, a location_master_id
--    wskazuje na public.locations. Trigger mapuje stary identyfikator
--    budynku na adres główny, zanim zadziała klucz obcy.
-- =============================================================================

-- Bucket i polityki odczytu są w 20261007210000 (publiczny URL,
-- bo panel i portal dewelopera wstawiają adres z getPublicUrl w <img>).
-- Tu zostaje tylko uzupełnienie zapisu usterki.

UPDATE storage.buckets
SET public = true
WHERE id = 'warranty-photos';

DROP POLICY IF EXISTS warranty_photos_insert_authenticated ON storage.objects;
DROP POLICY IF EXISTS warranty_photos_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS warranty_photos_update_authenticated ON storage.objects;
DROP POLICY IF EXISTS warranty_photos_delete_authenticated ON storage.objects;

CREATE OR REPLACE FUNCTION public.tg_developer_warranty_issues_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master uuid;
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT m.org_id
      INTO NEW.org_id
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND COALESCE(m.is_active, true) = true
      AND m.role = ANY (ARRAY['owner', 'manager', 'admin', 'coordinator'])
    ORDER BY m.created_at ASC NULLS LAST, m.id ASC
    LIMIT 1;
  END IF;

  IF NEW.location_master_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.locations l WHERE l.id = NEW.location_master_id
     ) THEN
    SELECT cl.location_master_id
      INTO v_master
    FROM public.cleaning_locations cl
    WHERE cl.id = NEW.location_master_id;

    IF v_master IS NOT NULL THEN
      NEW.location_master_id := v_master;
    END IF;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_developer_warranty_issues_before_insert() FROM PUBLIC, anon, authenticated;

-- Zapis usterki odpala AFTER INSERT, który loguje zdarzenie.
-- Funkcja czytała profiles.display_name (kolumna nie istnieje) i nie miała
-- polityki INSERT na developer_warranty_issue_events, więc cały zapis padał.
CREATE OR REPLACE FUNCTION private.trg_log_warranty_issue_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_actor_type text;
  v_actor_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := 'status_changed';
    ELSIF OLD.photos_completion IS DISTINCT FROM NEW.photos_completion THEN
      v_event_type := 'photos_added';
    ELSE
      v_event_type := 'updated';
    END IF;
  END IF;

  v_actor_type := 'admin';
  v_actor_name := (
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  );

  INSERT INTO public.developer_warranty_issue_events (
    issue_id,
    event_type,
    old_status,
    new_status,
    actor_type,
    actor_user_id,
    actor_name,
    event_metadata
  ) VALUES (
    NEW.id,
    v_event_type,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    v_actor_type,
    auth.uid(),
    v_actor_name,
    jsonb_build_object(
      'operation', TG_OP,
      'changed_fields', CASE
        WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
          'status', (OLD.status IS DISTINCT FROM NEW.status),
          'photos_completion', (OLD.photos_completion IS DISTINCT FROM NEW.photos_completion)
        )
        ELSE '{}'::jsonb
      END
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_log_warranty_issue_lifecycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS developer_warranty_issues_before_insert ON public.developer_warranty_issues;
CREATE TRIGGER developer_warranty_issues_before_insert
  BEFORE INSERT ON public.developer_warranty_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_developer_warranty_issues_before_insert();
