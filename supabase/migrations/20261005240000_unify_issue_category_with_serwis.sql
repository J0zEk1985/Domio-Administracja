BEGIN;

-- Align property_issues.category and location_vendor_routing.issue_category
-- with Serwis taxonomy. Historical Admin labels (Sprzęt, sprzątanie, …) → Inna.

-- Prefer a row that already has the canonical label; otherwise newest created_at.
DELETE FROM public.location_vendor_routing
WHERE id IN (
  WITH mapped AS (
    SELECT
      id,
      location_id,
      created_at,
      issue_category,
      CASE
        WHEN issue_category IN (
          'Hydrauliczna',
          'Elektryczna',
          'Ślusarska',
          'Ogólnobudowlana',
          'Inna'
        ) THEN issue_category
        ELSE 'Inna'
      END AS canon
    FROM public.location_vendor_routing
  ),
  ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY location_id, canon
        ORDER BY
          CASE WHEN issue_category = canon THEN 0 ELSE 1 END,
          created_at DESC NULLS LAST,
          id DESC
      ) AS rn
    FROM mapped
  )
  SELECT id FROM ranked WHERE rn > 1
);

UPDATE public.location_vendor_routing
SET issue_category = 'Inna'
WHERE issue_category NOT IN (
  'Hydrauliczna',
  'Elektryczna',
  'Ślusarska',
  'Ogólnobudowlana',
  'Inna'
);

UPDATE public.property_issues
SET category = 'Inna'
WHERE category IS NOT NULL
  AND btrim(category) <> ''
  AND btrim(category) NOT IN (
    'Hydrauliczna',
    'Elektryczna',
    'Ślusarska',
    'Ogólnobudowlana',
    'Inna'
  );

COMMENT ON COLUMN public.property_issues.category IS
  'Hydrauliczna | Elektryczna | Ślusarska | Ogólnobudowlana | Inna';

COMMIT;
