-- Osiedle społeczne (ponad org_id): federacja wspólnot po zgodzie zarządców.
-- Operacje (usterki, e-board, przeglądy) pozostają per wspólnota/budynek.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estate_member_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.estate_member_status AS ENUM (
      'invited',
      'accepted',
      'rejected',
      'withdrawn'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.estates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by_org_id uuid NOT NULL REFERENCES public.organizations (id),
  created_by_user_id uuid REFERENCES public.profiles (id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estates_name_not_blank CHECK (length(btrim(name)) > 0)
);

COMMENT ON TABLE public.estates IS
  'Social estate (osiedle): shared neighbor board across communities. Not a legal entity or tenant.';

CREATE TABLE IF NOT EXISTS public.estate_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES public.estates (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id),
  status public.estate_member_status NOT NULL DEFAULT 'invited',
  invited_by_org_id uuid NOT NULL REFERENCES public.organizations (id),
  consented_at timestamptz,
  consented_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estate_id, community_id)
);

COMMENT ON TABLE public.estate_members IS
  'Community membership in a social estate. org_id is denormalized from communities.org_id.';

CREATE UNIQUE INDEX IF NOT EXISTS estate_members_one_active_per_community
  ON public.estate_members (community_id)
  WHERE status IN ('invited', 'accepted');

CREATE INDEX IF NOT EXISTS idx_estate_members_community_status
  ON public.estate_members (community_id, status);

CREATE INDEX IF NOT EXISTS idx_estate_members_estate_accepted
  ON public.estate_members (estate_id)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_estate_members_org_status
  ON public.estate_members (org_id, status);

ALTER TABLE public.community_board
  ADD COLUMN IF NOT EXISTS estate_id uuid REFERENCES public.estates (id) ON DELETE SET NULL;

ALTER TABLE public.community_board
  ADD COLUMN IF NOT EXISTS origin_label text;

CREATE INDEX IF NOT EXISTS idx_community_board_estate_created
  ON public.community_board (estate_id, created_at DESC)
  WHERE estate_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_estates_updated_at ON public.estates;
CREATE TRIGGER trg_estates_updated_at
  BEFORE UPDATE ON public.estates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_estate_members_updated_at ON public.estate_members;
CREATE TRIGGER trg_estate_members_updated_at
  BEFORE UPDATE ON public.estate_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION private.estate_members_sync_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = NEW.community_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ESTATE_COMMUNITY_NOT_FOUND';
  END IF;

  NEW.org_id := v_org;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estate_members_sync_org ON public.estate_members;
CREATE TRIGGER trg_estate_members_sync_org
  BEFORE INSERT OR UPDATE OF community_id, org_id
  ON public.estate_members
  FOR EACH ROW
  EXECUTE FUNCTION private.estate_members_sync_org();

CREATE OR REPLACE FUNCTION private.community_board_apply_estate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_community_id uuid;
  v_address text;
  v_name text;
  v_estate uuid;
BEGIN
  SELECT cl.community_id, cl.address, cl.name
  INTO v_community_id, v_address, v_name
  FROM public.cleaning_locations cl
  WHERE cl.id = NEW.location_id;

  NEW.origin_label := COALESCE(
    NULLIF(btrim(COALESCE(v_address, '')), ''),
    NULLIF(btrim(COALESCE(v_name, '')), ''),
    'Budynek'
  );

  v_estate := NULL;
  IF v_community_id IS NOT NULL THEN
    SELECT em.estate_id
    INTO v_estate
    FROM public.estate_members em
    JOIN public.estates e ON e.id = em.estate_id
    WHERE em.community_id = v_community_id
      AND em.status = 'accepted'
      AND e.status = 'active'
    LIMIT 1;
  END IF;

  NEW.estate_id := v_estate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_board_apply_estate ON public.community_board;
CREATE TRIGGER trg_community_board_apply_estate
  BEFORE INSERT ON public.community_board
  FOR EACH ROW
  EXECUTE FUNCTION private.community_board_apply_estate();
