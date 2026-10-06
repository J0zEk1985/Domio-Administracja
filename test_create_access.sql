-- Test: Wywołanie funkcji RPC z przykładowymi danymi
SELECT public.create_developer_access_and_send_invite(
  'cff671fc-3c03-48bf-a8b6-7bcf9a9a3310'::uuid,  -- community_id dla "NOWE POLESIE 3"
  'test-developer@example.com',
  'Test Developer Inc.'
);

-- Po teście sprawdzamy czy rekord został utworzony
SELECT 
    id,
    developer_name,
    developer_email,
    activation_token,
    activated_at
FROM public.developer_accesses
WHERE developer_email = 'test-developer@example.com';
