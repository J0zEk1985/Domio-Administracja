-- Data wipe for Domio test phase (NOT a schema migration).
-- Scope C: empty organization + 2 protected accounts only.
-- Protected: jozefiakmar@gmail.com, jozefiakmarcin@o2.pl
-- Deleted staff: m.jozefiak@staff.domio.com.pl
-- Apply via MCP execute_sql on project bmozhsbcwpufovwnmjeb (transactional).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'jozefiakmar@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Protected user jozefiakmar@gmail.com missing — abort wipe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'jozefiakmarcin@o2.pl'
  ) THEN
    RAISE EXCEPTION 'Protected user jozefiakmarcin@o2.pl missing — abort wipe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = '805a6351-6203-49de-901e-dd542b5d1b4c'
  ) THEN
    RAISE EXCEPTION 'Expected organization Domio Cleaning System missing — abort wipe';
  END IF;
END
$$;

-- 1) Task / issue dependents
DELETE FROM public.task_step_logs;
DELETE FROM public.task_execution_logs;
DELETE FROM public.task_comments;

-- 2) Operational work items
DELETE FROM public.cleaning_tasks;
DELETE FROM public.property_issues;
DELETE FROM public.property_tasks;
DELETE FROM public.material_requests;
DELETE FROM public.internal_tasks;
DELETE FROM public.repair_logs;
DELETE FROM public.offer_interactions;

-- 3) Staff / fleet / finance
DELETE FROM public.staff_payouts;
DELETE FROM public.staff_financial_adjustments;
DELETE FROM public.staff_rate_history;
DELETE FROM public.staff_equipment;
DELETE FROM public.cleaning_staff;
DELETE FROM public.fuel_logs;
DELETE FROM public.vehicles;

-- 4) Inspections / c-KOB / contracts
DELETE FROM public.unit_inspection_records;
DELETE FROM public.property_inspections;
DELETE FROM public.inspections;
DELETE FROM public.inspections_hybrid;
DELETE FROM public.inspection_campaigns;
DELETE FROM public.building_inspections;
DELETE FROM public.ckob_sync_logs;
DELETE FROM public.ckob_property_mappings;
DELETE FROM public.ckob_credentials;
DELETE FROM public.admin_contracts;
DELETE FROM public.property_contracts;
DELETE FROM public.property_policies;

-- 5) Home / e-board / partners
DELETE FROM public.community_comments;
DELETE FROM public.community_board;
DELETE FROM public.e_board_messages;
DELETE FROM public.partner_offers;
DELETE FROM public.vendor_partners;
DELETE FROM public.resident_configs;
DELETE FROM public.location_vendor_routing;
DELETE FROM public.org_subscriptions;

-- 6) Templates / sections / access / inventory
DELETE FROM public.property_checklists;
DELETE FROM public.property_sections;
DELETE FROM public.location_holidays;
DELETE FROM public.location_access;
DELETE FROM public.cleaning_inventory;

-- 7) Buildings / clients / communities / companies / misc content
DELETE FROM public.cleaning_locations;
DELETE FROM public.locations;
DELETE FROM public.cleaning_clients;
DELETE FROM public.communities;
DELETE FROM public.companies;
-- DELETE FROM public.legal_documents; -- PROTECTED: Required for signup (terms, privacy, marketing)
DELETE FROM public.promo_codes;
DELETE FROM public.page_content;

-- 7b) Warehouse / Magazyn (Cleaning)
DELETE FROM public.material_requests;
DELETE FROM public.cleaning_inventory;
DELETE FROM public.cleaning_catalog;

-- 8) Storage objects (photos)
-- Direct DELETE FROM storage.objects is blocked by protect_objects_delete.
-- Cleared via Edge Function wipe-storage-test-phase (Storage API + service role).
-- Expected after wipe: storage.objects = 0

-- 9) Staff auth user (memberships/profiles CASCADE)
DELETE FROM auth.users
WHERE email = 'm.jozefiak@staff.domio.com.pl';

-- Guard: never leave non-protected users
DO $$
DECLARE
  leftover integer;
BEGIN
  SELECT count(*) INTO leftover
  FROM auth.users
  WHERE email NOT IN ('jozefiakmar@gmail.com', 'jozefiakmarcin@o2.pl');

  IF leftover > 0 THEN
    RAISE EXCEPTION 'Non-protected auth.users remain after wipe: %', leftover;
  END IF;
END
$$;

COMMIT;
