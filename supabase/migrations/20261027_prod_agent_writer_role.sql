-- Production DOMIO database (supabase-db-c79x9r7qj8hyjitgl6mdkldz). Run as supabase_admin.
-- Same file as Domio-Administracja/supabase/migrations/20261027_prod_agent_writer_role.sql.
--
-- K4: the n8n agent used the production service_role key (bypasses RLS, full write
-- access to every table). This migration adds the restricted PostgREST role
-- `agent_writer`: SELECT within one company and INSERT/UPDATE of the few columns the
-- agent catalog allows, on the three tables it writes to. The company comes from the
-- `x-domio-org-id` request header; a request without the header sees and writes nothing.
-- Additive: no existing grant, policy or row is changed.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_writer') THEN
    CREATE ROLE agent_writer NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

-- PostgREST switches to the role named in the JWT; authenticator must be allowed to.
GRANT agent_writer TO authenticator;
ALTER ROLE agent_writer SET statement_timeout = '10s';
GRANT USAGE ON SCHEMA public TO agent_writer;
-- Triggers on property_issues call auth.uid() (NULL for this role). No table access in auth.
GRANT USAGE ON SCHEMA auth TO agent_writer;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO agent_writer;

-- Company of the current PostgREST request (lowercase header name, UUID or NULL).
CREATE OR REPLACE FUNCTION public.agent_request_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN header ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN header::uuid
  END
  FROM (
    SELECT lower(btrim(
      NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-domio-org-id'
    )) AS header
  ) AS request;
$$;

REVOKE ALL ON FUNCTION public.agent_request_org() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_request_org() TO agent_writer, service_role;

-- Reads needed for the DOMIO scope (communities, buildings, open issues).
GRANT SELECT (id, name, org_id, status, deactivated_at) ON public.communities TO agent_writer;
GRANT SELECT (id, name, address, community_id, org_id, location_master_id) ON public.cleaning_locations TO agent_writer;
GRANT SELECT ON public.property_issues TO agent_writer;
GRANT SELECT ON public.cleaning_tasks TO agent_writer;
GRANT SELECT ON public.vehicles TO agent_writer;
-- Read by the trigger private.tg_fill_shared_orgs_from_live_grants on insert.
GRANT SELECT ON public.succession_share_grants TO agent_writer;

-- Writes: only the columns of the agent catalog (agent-n8n/scripts/domio-write.mjs).
GRANT INSERT (org_id, description, category, reported_address, priority, reporter_name, reporter_phone,
              reporter_email, location_id, source, status, reporter_type, is_ai_draft)
  ON public.property_issues TO agent_writer;
GRANT UPDATE (description, category, reported_address, priority, resolution_notes, waiting_reason, status)
  ON public.property_issues TO agent_writer;

GRANT INSERT (org_id, location_id, scheduled_at, coordinator_notes, priority, status, task_type)
  ON public.cleaning_tasks TO agent_writer;
GRANT UPDATE (scheduled_at, coordinator_notes, priority, status)
  ON public.cleaning_tasks TO agent_writer;

GRANT INSERT (org_id, model, reg_no, vin, year, insurance_expiry, next_inspection, mileage, tire_info)
  ON public.vehicles TO agent_writer;
GRANT UPDATE (mileage, tire_info, tire_change_date, next_inspection, insurance_expiry)
  ON public.vehicles TO agent_writer;

-- Row level: one company per request, always.
DROP POLICY IF EXISTS agent_writer_select ON public.communities;
CREATE POLICY agent_writer_select ON public.communities
  FOR SELECT TO agent_writer
  USING (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_select ON public.cleaning_locations;
CREATE POLICY agent_writer_select ON public.cleaning_locations
  FOR SELECT TO agent_writer
  USING (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_select ON public.property_issues;
CREATE POLICY agent_writer_select ON public.property_issues
  FOR SELECT TO agent_writer
  USING (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_insert ON public.property_issues;
CREATE POLICY agent_writer_insert ON public.property_issues
  FOR INSERT TO agent_writer
  WITH CHECK (org_id = public.agent_request_org() AND is_ai_draft IS TRUE);

DROP POLICY IF EXISTS agent_writer_update ON public.property_issues;
CREATE POLICY agent_writer_update ON public.property_issues
  FOR UPDATE TO agent_writer
  USING (org_id = public.agent_request_org())
  WITH CHECK (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_select ON public.cleaning_tasks;
CREATE POLICY agent_writer_select ON public.cleaning_tasks
  FOR SELECT TO agent_writer
  USING (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_insert ON public.cleaning_tasks;
CREATE POLICY agent_writer_insert ON public.cleaning_tasks
  FOR INSERT TO agent_writer
  WITH CHECK (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_update ON public.cleaning_tasks;
CREATE POLICY agent_writer_update ON public.cleaning_tasks
  FOR UPDATE TO agent_writer
  USING (org_id = public.agent_request_org())
  WITH CHECK (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_select ON public.vehicles;
CREATE POLICY agent_writer_select ON public.vehicles
  FOR SELECT TO agent_writer
  USING (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_insert ON public.vehicles;
CREATE POLICY agent_writer_insert ON public.vehicles
  FOR INSERT TO agent_writer
  WITH CHECK (org_id = public.agent_request_org());

DROP POLICY IF EXISTS agent_writer_update ON public.vehicles;
CREATE POLICY agent_writer_update ON public.vehicles
  FOR UPDATE TO agent_writer
  USING (org_id = public.agent_request_org())
  WITH CHECK (org_id = public.agent_request_org());

-- Share grants of the company's own buildings only (trigger lookup on insert).
DROP POLICY IF EXISTS agent_writer_select ON public.succession_share_grants;
CREATE POLICY agent_writer_select ON public.succession_share_grants
  FOR SELECT TO agent_writer
  USING (EXISTS (
    SELECT 1 FROM public.cleaning_locations AS cl
    WHERE cl.location_master_id = succession_share_grants.location_master_id
      AND cl.org_id = public.agent_request_org()
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
