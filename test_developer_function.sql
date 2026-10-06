-- Test: Sprawdzenie czy funkcja create_developer_access_and_send_invite istnieje i ma poprawną sygnaturę
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'create_developer_access_and_send_invite';

-- Sprawdzenie parametrów funkcji
SELECT 
    parameter_name,
    data_type,
    parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name IN (
    SELECT specific_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND routine_name = 'create_developer_access_and_send_invite'
  )
ORDER BY ordinal_position;
