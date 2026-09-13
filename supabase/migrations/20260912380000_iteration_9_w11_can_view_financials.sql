-- =====================================================================
-- ITERACJA 9 - W11 can_view_financials w RLS
--
-- Kolumny juz istnieja (memberships.can_view_financials / can_view_billing,
-- organizations.global_coordinator_view_financials). Zadne RLS ich nie
-- czytalo: koordynator bez flagi i tak ALL na staff_payouts.
--
-- W Cleaning lista plac (FinanceSection) ignorowala flage - UI idzie za
-- PropertyDetailsPage: owner zawsze, coordinator gdy flaga czlonkostwa,
-- can_view_billing albo przelacznik org.
--
-- NIE ruszamy property_issue_billing / is_serwis_dispatcher_or_owner:
-- dyspozytor Serwisu (manager) musi widziec protokol, a zakladka Rozliczenia
-- i tak jest juz ucieta w useManagerAccess.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.can_view_org_financials(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.organizations o ON o.id = m.org_id
    WHERE m.org_id = target_org_id
      AND m.user_id = (SELECT auth.uid())
      AND COALESCE(m.is_active, true) = true
      AND (
        lower(btrim(COALESCE(m.role, ''))) IN (
          'owner', 'admin', 'administrator', 'wlasciciel', 'właściciel'
        )
        OR (
          lower(btrim(COALESCE(m.role, ''))) IN ('coordinator', 'koordynator')
          AND (
            COALESCE(m.can_view_financials, false)
            OR COALESCE(m.can_view_billing, false)
            OR COALESCE(o.global_coordinator_view_financials, false)
            OR COALESCE((m.permissions ->> 'can_view_financials')::boolean, false)
          )
        )
      )
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_view_org_financials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_org_financials(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can manage payouts" ON public.staff_payouts;
DROP POLICY IF EXISTS staff_payouts_manage_financials ON public.staff_payouts;
CREATE POLICY staff_payouts_manage_financials
  ON public.staff_payouts
  FOR ALL TO authenticated
  USING (public.can_view_org_financials(org_id))
  WITH CHECK (public.can_view_org_financials(org_id));

DROP POLICY IF EXISTS "Org isolation ALL for owners staff_financial_adjustments" ON public.staff_financial_adjustments;
DROP POLICY IF EXISTS staff_financial_adjustments_manage_financials ON public.staff_financial_adjustments;
CREATE POLICY staff_financial_adjustments_manage_financials
  ON public.staff_financial_adjustments
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.memberships m_employee
      WHERE m_employee.user_id = staff_financial_adjustments.user_id
        AND public.can_view_org_financials(m_employee.org_id)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.memberships m_employee
      WHERE m_employee.user_id = staff_financial_adjustments.user_id
        AND public.can_view_org_financials(m_employee.org_id)
    )
  );

DROP POLICY IF EXISTS staff_rate_history_select_cleaning_mgmt ON public.staff_rate_history;
DROP POLICY IF EXISTS staff_rate_history_select_financials ON public.staff_rate_history;
CREATE POLICY staff_rate_history_select_financials
  ON public.staff_rate_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships staff
      WHERE staff.user_id = staff_rate_history.staff_id
        AND public.can_view_org_financials(staff.org_id)
    )
  );
