-- Sprawdzenie czy dla wspólnoty "NOWE POLESIE 3" już istnieje dostęp dewelopera
SELECT 
    da.id,
    da.developer_name,
    da.developer_email,
    da.activated_at,
    c.name as community_name
FROM public.developer_accesses da
JOIN public.communities c ON c.id = da.community_id
WHERE da.community_id = 'cff671fc-3c03-48bf-a8b6-7bcf9a9a3310';

-- Sprawdzenie wszystkich istniejących dostępów
SELECT 
    da.id,
    da.developer_name,
    da.developer_email,
    da.activated_at,
    c.name as community_name
FROM public.developer_accesses da
JOIN public.communities c ON c.id = da.community_id;
