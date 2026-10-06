-- Sprawdzenie uprawnień do wykonania funkcji
SELECT 
    routine_schema,
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'create_developer_access_and_send_invite';

-- Sprawdzenie czy funkcja jest SECURITY DEFINER
SELECT 
    proname,
    prosecdef,
    provolatile,
    proacl
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'create_developer_access_and_send_invite';
