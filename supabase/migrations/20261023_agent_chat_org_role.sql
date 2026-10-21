-- Same function as Agent AI/agent-chat/sql/agent_chat_org_role.sql.
-- Company role (admin, manager, member) of one DOMIO user for the agent chat.
-- A platform administrator is admin in every company. An individual
-- agent_chat_grants row without a membership is manager.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_chat_org_role(
  p_user_id uuid,
  p_org_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM public.profiles AS p
       WHERE p.id = p_user_id
         AND lower(btrim(COALESCE(p.platform_role, ''))) = 'admin'
    ) THEN 'admin'
    WHEN EXISTS (
      SELECT 1
        FROM public.memberships AS m
       WHERE m.user_id = p_user_id
         AND m.org_id = p_org_id
         AND COALESCE(m.is_active, true) = true
         AND lower(btrim(COALESCE(m.role, ''))) IN (
           'owner', 'wlasciciel', 'właściciel', 'admin', 'administrator'
         )
    ) THEN 'admin'
    WHEN EXISTS (
      SELECT 1
        FROM public.memberships AS m
       WHERE m.user_id = p_user_id
         AND m.org_id = p_org_id
         AND COALESCE(m.is_active, true) = true
         AND public.agent_rules_manager_role(m.role)
    ) THEN 'manager'
    WHEN EXISTS (
      SELECT 1
        FROM public.memberships AS m
       WHERE m.user_id = p_user_id
         AND m.org_id = p_org_id
         AND COALESCE(m.is_active, true) = true
    ) THEN 'member'
    WHEN EXISTS (
      SELECT 1
        FROM public.agent_chat_grants AS g
       WHERE g.user_id = p_user_id
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at > now())
         AND (g.org_id IS NULL OR g.org_id = p_org_id)
    ) THEN 'manager'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.agent_chat_org_role(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'community_directory') THEN
    GRANT EXECUTE ON FUNCTION public.agent_chat_org_role(uuid, uuid) TO community_directory;
  END IF;
END $$;

COMMIT;
