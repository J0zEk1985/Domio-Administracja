-- Who may read and edit AI procedures, and which communities may be named
-- in the signed agent token. Editing is limited to owner, administrator
-- (coordinator is the administrator label in the team UI) and manager.
-- The token list is the wider administrative team that can already open
-- the community in DOMIO, including assistant and accountant.
-- Field staff and residents are not included. The check follows the
-- community's organisation, not a client-supplied list.

CREATE OR REPLACE FUNCTION public.agent_rules_manager_role(raw_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT lower(btrim(COALESCE(raw_role, ''))) IN (
    'owner', 'wlasciciel', 'właściciel',
    'admin', 'administrator', 'coordinator', 'koordynator',
    'manager', 'zarzadca', 'zarządca'
  );
$fn$;

CREATE OR REPLACE FUNCTION public.agent_rules_access_role(raw_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT public.agent_rules_manager_role(raw_role)
    OR lower(btrim(COALESCE(raw_role, ''))) IN ('assistant', 'accountant', 'bookkeeper');
$fn$;

CREATE OR REPLACE FUNCTION public.can_manage_community_agent_rules(p_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.communities c
    JOIN public.memberships m ON m.org_id = c.org_id
    WHERE c.id = p_community_id
      AND m.user_id = (SELECT auth.uid())
      AND COALESCE(m.is_active, true) = true
      AND public.agent_rules_manager_role(m.role)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.list_my_agent_community_ids()
RETURNS TABLE (community_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.id
  FROM public.communities c
  JOIN public.memberships m ON m.org_id = c.org_id
  WHERE m.user_id = (SELECT auth.uid())
    AND COALESCE(m.is_active, true) = true
    AND public.agent_rules_access_role(m.role)
  ORDER BY c.name;
$fn$;

REVOKE ALL ON FUNCTION public.agent_rules_manager_role(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_rules_access_role(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_community_agent_rules(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_agent_community_ids() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_manage_community_agent_rules(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_agent_community_ids() TO authenticated, service_role;
