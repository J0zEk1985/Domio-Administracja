-- Automatic inbound analysis follows remaining credits, not only a plan flag.
-- Org managers can add a fixed non-expiring pack. The client cannot choose the size.

BEGIN;

CREATE OR REPLACE FUNCTION private.inbound_has_ai_auto(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'private'
AS $$
  SELECT private.inbound_ai_credit_available(p_org_id) > 0
      OR EXISTS (
        SELECT 1
        FROM public.org_subscriptions os
        JOIN public.pricing_plans pp ON pp.id = os.plan_id
        WHERE os.org_id = p_org_id
          AND os.status = 'active'
          AND (os.expires_at IS NULL OR os.expires_at > now())
          AND COALESCE(pp.has_ai_features, false) = true
      );
$$;

ALTER TABLE public.org_ai_credit_ledger
  DROP CONSTRAINT IF EXISTS org_ai_credit_ledger_reason_chk;

ALTER TABLE public.org_ai_credit_ledger
  ADD CONSTRAINT org_ai_credit_ledger_reason_chk
  CHECK (reason IN ('grant', 'parse', 'purchase'));

ALTER TABLE public.org_ai_credit_ledger
  ADD COLUMN IF NOT EXISTS actor_id uuid;

COMMENT ON COLUMN public.org_ai_credit_ledger.actor_id IS
  'User who purchased or granted the credits. Null for system consumption.';

CREATE OR REPLACE FUNCTION public.purchase_ai_analysis_pack(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_pack CONSTANT integer := 100;
  v_balance integer;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Wymagane logowanie.';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Brak organizacji.';
  END IF;
  IF NOT (SELECT public.is_platform_admin())
     AND NOT (SELECT public.is_org_management(p_org_id)) THEN
    RAISE EXCEPTION 'Brak uprawnień do zakupu pakietu analiz.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_org_id) THEN
    RAISE EXCEPTION 'Nie znaleziono organizacji.';
  END IF;

  INSERT INTO public.org_ai_prepaid_credits (org_id, balance)
  VALUES (p_org_id, 0)
  ON CONFLICT (org_id) DO NOTHING;

  UPDATE public.org_ai_prepaid_credits
  SET balance = balance + v_pack
  WHERE org_id = p_org_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.org_ai_credit_ledger (org_id, delta, reason, actor_id)
  VALUES (p_org_id, v_pack, 'purchase', v_actor);

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'granted', v_pack,
    'ai_prepaid_balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_ai_analysis_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_ai_analysis_pack(uuid) TO authenticated;

COMMIT;
