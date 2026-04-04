-- PropTech pivot: domena wspólnoty (communities) vs budynek (cleaning_locations).
-- Źródło danych: cleaning_locations.visibility_config->admin_data (+ legacy kolumny).
-- Strategia wielu budynków pod jedną wspólnotą: pierwszy cleaning_locations.id (ORDER BY id).

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS regon text,
  ADD COLUMN IF NOT EXISTS board_email text,
  ADD COLUMN IF NOT EXISTS financial_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS operational_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS board_members jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_financial_details_object_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_financial_details_object_check
  CHECK (jsonb_typeof(financial_details) = 'object');

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_access_codes_object_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_access_codes_object_check
  CHECK (jsonb_typeof(access_codes) = 'object');

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_operational_notes_object_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_operational_notes_object_check
  CHECK (jsonb_typeof(operational_notes) = 'object');

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_board_members_array_check;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_board_members_array_check
  CHECK (jsonb_typeof(board_members) = 'array');

COMMENT ON COLUMN public.communities.legal_name IS
  'Pełna nazwa bytu prawnego wspólnoty (z formal.communityName / name).';
COMMENT ON COLUMN public.communities.regon IS 'REGON wspólnoty.';
COMMENT ON COLUMN public.communities.board_email IS
  'E-mail zarządu (admin_data.boardEmail; fallback client_notification_email).';
COMMENT ON COLUMN public.communities.financial_details IS
  'Stawki i rozliczenia (JSON: usableAreaM2, garageAreaM2, stawki, contractAmendmentDate, billingDetailsLegacy).';
COMMENT ON COLUMN public.communities.access_codes IS
  'Kody dostępu (JSON: intercom, keypad, gate, legacyText, legacySingle).';
COMMENT ON COLUMN public.communities.operational_notes IS
  'Uwagi operacyjne (JSON: administration, cleaning, serwis, adminContactsLegacy).';
COMMENT ON COLUMN public.communities.board_members IS
  'Członkowie zarządu (JSON array).';

WITH ranked AS (
  SELECT
    cl.id,
    cl.community_id,
    cl.visibility_config,
    cl.square_meters,
    cl.billing_details,
    cl.access_codes AS legacy_access_codes_text,
    cl.access_code AS legacy_access_code_single,
    cl.admin_contacts,
    cl.client_notification_email,
    row_number() OVER (PARTITION BY cl.community_id ORDER BY cl.id) AS rn
  FROM public.cleaning_locations cl
  WHERE cl.community_id IS NOT NULL
),
src AS (
  SELECT * FROM ranked WHERE rn = 1
),
extracted AS (
  SELECT
    s.community_id,
    CASE
      WHEN s.visibility_config IS NOT NULL
        AND jsonb_typeof(s.visibility_config::jsonb) = 'object'
      THEN (s.visibility_config::jsonb) #> '{admin_data}'
      ELSE NULL
    END AS admin_data,
    s.square_meters,
    s.billing_details,
    s.legacy_access_codes_text,
    s.legacy_access_code_single,
    s.admin_contacts,
    s.client_notification_email
  FROM src s
),
normalized AS (
  SELECT
    e.community_id,
    e.admin_data,
    e.square_meters,
    e.billing_details,
    e.legacy_access_codes_text,
    e.legacy_access_code_single,
    e.admin_contacts,
    e.client_notification_email,
    CASE
      WHEN e.admin_data IS NOT NULL
        AND (e.admin_data::jsonb) ? 'finance'
        AND nullif(trim(e.admin_data::jsonb->'finance'->>'usableAreaM2'), '') IS NOT NULL
      THEN (nullif(trim(e.admin_data::jsonb->'finance'->>'usableAreaM2'), ''))::numeric
      ELSE NULL
    END AS finance_usable_num
  FROM extracted e
)
UPDATE public.communities c
SET
  legal_name = coalesce(
    nullif(trim(coalesce(n.admin_data::jsonb->'formal'->>'communityName', '')), ''),
    c.legal_name,
    c.name
  ),
  nip = coalesce(
    nullif(trim(coalesce(n.admin_data::jsonb->'formal'->>'nip', '')), ''),
    nullif(trim(c.nip::text), ''),
    c.nip
  ),
  regon = coalesce(
    nullif(trim(coalesce(n.admin_data::jsonb->'formal'->>'regon', '')), ''),
    nullif(trim(c.regon), ''),
    c.regon
  ),
  board_email = coalesce(
    nullif(trim(coalesce(n.admin_data::jsonb->>'boardEmail', '')), ''),
    nullif(trim(coalesce(n.client_notification_email, '')), ''),
    nullif(trim(c.board_email), ''),
    c.board_email
  ),
  financial_details = jsonb_strip_nulls(
    jsonb_build_object(
      'usableAreaM2', coalesce(
        to_jsonb(n.finance_usable_num),
        case
          when n.square_meters is not null then to_jsonb(n.square_meters)
          else null
        end
      ),
      'garageAreaM2', n.admin_data::jsonb #> '{finance,garageAreaM2}',
      'rateUsablePerM2', n.admin_data::jsonb #> '{finance,rateUsablePerM2}',
      'rateGaragePerM2', n.admin_data::jsonb #> '{finance,rateGaragePerM2}',
      'contractAmendmentDate', n.admin_data::jsonb #> '{finance,contractAmendmentDate}',
      'billingDetailsLegacy', to_jsonb(nullif(trim(n.billing_details), ''))
    )
  ),
  access_codes = jsonb_strip_nulls(
    jsonb_build_object(
      'intercom', nullif(trim(coalesce(n.admin_data::jsonb->'accessCodes'->>'intercom', '')), ''),
      'keypad', nullif(trim(coalesce(n.admin_data::jsonb->'accessCodes'->>'keypad', '')), ''),
      'gate', nullif(trim(coalesce(n.admin_data::jsonb->'accessCodes'->>'gate', '')), ''),
      'legacyText', nullif(trim(coalesce(n.legacy_access_codes_text, '')), ''),
      'legacySingle', nullif(trim(coalesce(n.legacy_access_code_single, '')), '')
    )
  ),
  operational_notes = jsonb_strip_nulls(
    jsonb_build_object(
      'administration', nullif(trim(coalesce(n.admin_data::jsonb->'notes'->>'administration', '')), ''),
      'cleaning', nullif(trim(coalesce(n.admin_data::jsonb->'notes'->>'cleaning', '')), ''),
      'serwis', nullif(trim(coalesce(n.admin_data::jsonb->'notes'->>'serwis', '')), ''),
      'adminContactsLegacy', n.admin_contacts
    )
  ),
  board_members = coalesce(n.admin_data::jsonb->'board', '[]'::jsonb)
FROM normalized n
WHERE c.id = n.community_id
  -- Idempotencja: po wycięciu admin_data z budynku ponowne uruchomienie skryptu nie nadpisuje communities pustymi wartościami
  AND n.admin_data IS NOT NULL
  AND jsonb_typeof(n.admin_data::jsonb) = 'object';

UPDATE public.cleaning_locations cl
SET visibility_config = case
  when cl.visibility_config is null then null
  when jsonb_typeof(cl.visibility_config::jsonb) = 'object'
    then (cl.visibility_config::jsonb) #- '{admin_data}'
  else cl.visibility_config::jsonb
end
WHERE cl.community_id IS NOT NULL
  AND cl.visibility_config IS NOT NULL
  AND (cl.visibility_config::jsonb) ? 'admin_data';

COMMENT ON COLUMN public.cleaning_locations.billing_details IS
  'DEPRECATED: konsolidacja w communities.financial_details.';
COMMENT ON COLUMN public.cleaning_locations.access_code IS
  'DEPRECATED: użyj communities.access_codes.';
COMMENT ON COLUMN public.cleaning_locations.access_codes IS
  'DEPRECATED (tekst): użyj communities.access_codes (JSON).';
COMMENT ON COLUMN public.cleaning_locations.admin_contacts IS
  'DEPRECATED: zarząd w communities.board_members.';
COMMENT ON COLUMN public.cleaning_locations.client_notification_email IS
  'DEPRECATED: communities.board_email.';

UPDATE public.cleaning_locations
SET
  billing_details = null,
  access_code = null,
  access_codes = null,
  admin_contacts = null,
  client_notification_email = null
WHERE community_id IS NOT NULL;
