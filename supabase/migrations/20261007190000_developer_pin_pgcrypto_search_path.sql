BEGIN;

-- pgcrypto (crypt, gen_salt) lives in the extensions schema.
-- These SECURITY DEFINER functions locked search_path to public, so
-- PIN hashing failed with: function gen_salt(unknown, integer) does not exist.

ALTER FUNCTION public.activate_developer_access(uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.developer_portal_login(uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.developer_add_warranty_issue_comment(uuid, text, uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.developer_update_warranty_issue_status(
  uuid,
  text,
  uuid,
  public.developer_warranty_issue_status,
  text,
  text[]
) SET search_path TO public, extensions;

ALTER FUNCTION public.get_developer_portal_data(uuid, text)
  SET search_path TO public, extensions;

COMMIT;
