-- Sprawdzenie użytkownika jozefiakmarcin@o2.pl
SELECT 
    u.id as user_id,
    u.email,
    u.raw_user_meta_data
FROM auth.users u
WHERE u.email = 'jozefiakmarcin@o2.pl';

-- Sprawdzenie członkostwa tego użytkownika
SELECT 
    m.user_id,
    m.org_id,
    m.role,
    o.name as org_name
FROM public.memberships m
JOIN public.organizations o ON o.id = m.org_id
WHERE m.user_id IN (
    SELECT id FROM auth.users WHERE email = 'jozefiakmarcin@o2.pl'
);

-- Sprawdzenie wspólnot w tej organizacji
SELECT 
    c.id as community_id,
    c.name as community_name,
    c.org_id,
    o.name as org_name
FROM public.communities c
JOIN public.organizations o ON o.id = c.org_id
WHERE c.org_id IN (
    SELECT m.org_id 
    FROM public.memberships m
    WHERE m.user_id IN (
        SELECT id FROM auth.users WHERE email = 'jozefiakmarcin@o2.pl'
    )
)
LIMIT 10;
