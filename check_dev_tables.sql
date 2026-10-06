SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'developer%';

SELECT typname FROM pg_type 
WHERE typname LIKE 'developer%';

SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%developer%';
