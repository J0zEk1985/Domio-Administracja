-- Warranty issue photos never had a storage bucket. The admin panel
-- uploads to warranty-photos/warranty-issues/* and stores the public URL.
-- Residents open that URL directly, so the bucket stays public.
--
-- INSERT is limited to authenticated users who belong to an organization
-- (or platform admins). The live client does not put org_id in the path.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'warranty-photos',
  'warranty-photos',
  true,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS warranty_photos_select ON storage.objects;
CREATE POLICY warranty_photos_select
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'warranty-photos');

DROP POLICY IF EXISTS warranty_photos_insert ON storage.objects;
CREATE POLICY warranty_photos_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'warranty-photos'
    AND (storage.foldername(name))[1] = 'warranty-issues'
    AND (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS warranty_photos_delete ON storage.objects;
CREATE POLICY warranty_photos_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'warranty-photos'
    AND owner = (SELECT auth.uid())
    AND (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.user_id = (SELECT auth.uid())
      )
    )
  );

COMMIT;
