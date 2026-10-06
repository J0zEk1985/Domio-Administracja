-- Sprawdzenie struktury tabeli memberships
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('memberships', 'org_memberships');

-- Sprawdzenie kilku przykładowych rekordów
SELECT user_id, org_id, role 
FROM public.memberships 
LIMIT 5;
