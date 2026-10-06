-- Test: Pobierz przykładowy community_id z bazy
SELECT id, name FROM public.communities LIMIT 1;

-- Test: Wywołaj funkcję RPC (będzie błąd jeśli community już ma dostęp)
-- Zmienimy później na prawdziwe wartości
-- SELECT public.create_developer_access_and_send_invite(
--   '<community_id>'::uuid,
--   'test@example.com',
--   'Test Developer'
-- );
