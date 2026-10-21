-- Same function as Agent AI/agent-chat/sql/agent_chat_scope.sql.
-- Resolves one DOMIO user to the companies and communities the agent chat may sign.
-- Platform administrators and service-wide agent_chat_grants see every active
-- community. A row in agent_chat_grants is an individual arrangement.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_chat_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  note text NOT NULL,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT agent_chat_grants_note_length CHECK (length(btrim(note)) BETWEEN 3 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_chat_grants_active_user_org_uidx
  ON public.agent_chat_grants (user_id, org_id)
  WHERE revoked_at IS NULL AND org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_chat_grants_active_service_uidx
  ON public.agent_chat_grants (user_id)
  WHERE revoked_at IS NULL AND org_id IS NULL;

COMMENT ON TABLE public.agent_chat_grants IS
  'Individual agent-chat arrangements. A null org_id covers every company. Extend expires_at or set revoked_at before inserting a replacement row.';

ALTER TABLE public.agent_chat_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_chat_grants FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_chat_scope(
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS TABLE (user_id uuid, org_id uuid, community_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
#variable_conflict use_column
DECLARE
  actor uuid;
  service_wide boolean := false;
BEGIN
  actor := p_user_id;
  IF actor IS NULL AND p_email IS NOT NULL AND length(btrim(p_email)) BETWEEN 3 AND 254 THEN
    SELECT users.id
      INTO actor
      FROM auth.users AS users
     WHERE lower(users.email) = lower(btrim(p_email))
     LIMIT 1;
  END IF;
  IF actor IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(btrim(COALESCE(p.platform_role, ''))) = 'admin'
    INTO service_wide
    FROM public.profiles AS p
   WHERE p.id = actor;
  service_wide := COALESCE(service_wide, false);

  IF NOT service_wide THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.agent_chat_grants AS g
       WHERE g.user_id = actor
         AND g.org_id IS NULL
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at > now())
    )
      INTO service_wide;
  END IF;

  RETURN QUERY
  SELECT scoped.actor_id, scoped.company_id, scoped.home_id
    FROM (
      SELECT actor AS actor_id, c.org_id AS company_id, c.id AS home_id, c.name AS sort_name
        FROM public.communities AS c
        JOIN public.memberships AS m ON m.org_id = c.org_id
       WHERE m.user_id = actor
         AND COALESCE(m.is_active, true) = true
         AND public.agent_rules_access_role(m.role)
         AND c.deactivated_at IS NULL

      UNION

      SELECT actor, c.org_id, c.id, c.name
        FROM public.communities AS c
       WHERE service_wide
         AND c.deactivated_at IS NULL

      UNION

      SELECT actor, o.id, NULL::uuid, o.name
        FROM public.organizations AS o
        JOIN public.memberships AS m ON m.org_id = o.id
       WHERE service_wide
         AND m.user_id = actor
         AND COALESCE(m.is_active, true) = true
         AND NOT EXISTS (
           SELECT 1
             FROM public.communities AS c
            WHERE c.org_id = o.id
              AND c.deactivated_at IS NULL
         )

      UNION

      SELECT actor, c.org_id, c.id, c.name
        FROM public.communities AS c
        JOIN public.agent_chat_grants AS g ON g.org_id = c.org_id
       WHERE g.user_id = actor
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at > now())
         AND c.deactivated_at IS NULL

      UNION

      SELECT actor, g.org_id, NULL::uuid, o.name
        FROM public.agent_chat_grants AS g
        JOIN public.organizations AS o ON o.id = g.org_id
       WHERE g.user_id = actor
         AND g.org_id IS NOT NULL
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at > now())
         AND NOT EXISTS (
           SELECT 1
             FROM public.communities AS c
            WHERE c.org_id = g.org_id
              AND c.deactivated_at IS NULL
         )
    ) AS scoped
   ORDER BY scoped.sort_name, scoped.home_id NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_chat_scope(uuid, text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'community_directory') THEN
    GRANT EXECUTE ON FUNCTION public.agent_chat_scope(uuid, text) TO community_directory;
  END IF;
END $$;

COMMIT;
