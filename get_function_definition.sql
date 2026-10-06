-- Pobierz definicję funkcji create_developer_access_and_send_invite
SELECT pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'create_developer_access_and_send_invite'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
