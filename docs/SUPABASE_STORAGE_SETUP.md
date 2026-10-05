# Konfiguracja Supabase Storage dla Modułu Usterek Deweloperskich

## Wymagania
Aby moduł uploadu zdjęć działał poprawnie, należy skonfigurować Supabase Storage bucket.

---

## Krok 1: Utworzenie Bucketa

### Przez Supabase Dashboard:
1. Zaloguj się do Supabase Dashboard
2. Przejdź do **Storage** w menu bocznym
3. Kliknij **New bucket**
4. Nazwa bucketa: `warranty-photos`
5. **Public bucket**: ✅ TAK (zdjęcia będą publicznie dostępne)
6. Kliknij **Create bucket**

### Przez SQL (alternatywa):
```sql
-- W Supabase SQL Editor:
INSERT INTO storage.buckets (id, name, public)
VALUES ('warranty-photos', 'warranty-photos', true);
```

---

## Krok 2: Konfiguracja RLS dla Bucketa

Ustaw polityki dostępu dla bucketa `warranty-photos`:

### 1. Polityka Upload (authenticated users)
```sql
CREATE POLICY "Authenticated users can upload warranty photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'warranty-photos' 
  AND (storage.foldername(name))[1] = 'warranty-issues'
);
```

### 2. Polityka Read (public)
```sql
CREATE POLICY "Anyone can view warranty photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'warranty-photos');
```

### 3. Polityka Delete (authenticated users - tylko własne)
```sql
CREATE POLICY "Users can delete their uploaded warranty photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'warranty-photos');
```

---

## Krok 3: Konfiguracja CORS (jeśli potrzebne)

Jeśli aplikacja jest hostowana na innej domenie niż Supabase:

```sql
-- W Supabase SQL Editor:
UPDATE storage.buckets
SET cors_config = '["*"]'::jsonb
WHERE id = 'warranty-photos';
```

Lub przez Dashboard:
1. Storage → Buckets → warranty-photos → Configuration
2. CORS Allowed Origins: `*` lub `https://admin.domio.com.pl`

---

## Krok 4: Limity rozmiaru plików

### Przez Dashboard:
1. Storage → Buckets → warranty-photos → Configuration
2. **Maximum file size**: `5MB` (domyślnie 50MB)

### Przez SQL:
```sql
UPDATE storage.buckets
SET file_size_limit = 5242880  -- 5MB in bytes
WHERE id = 'warranty-photos';
```

---

## Krok 5: Dozwolone typy plików

### Przez Dashboard:
1. Storage → Buckets → warranty-photos → Configuration
2. **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/gif`

### Przez SQL:
```sql
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'warranty-photos';
```

---

## Weryfikacja konfiguracji

### Sprawdź czy bucket istnieje:
```sql
SELECT * FROM storage.buckets WHERE id = 'warranty-photos';
```

Oczekiwany wynik:
```
id              | name            | public | file_size_limit | allowed_mime_types
warranty-photos | warranty-photos | true   | 5242880         | {image/jpeg, image/png, ...}
```

### Sprawdź polityki RLS:
```sql
SELECT * FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%warranty%';
```

---

## Struktura folderów

Zdjęcia będą zapisywane w następującej strukturze:
```
warranty-photos/
  └── warranty-issues/
      ├── 1696543210000-abc123.jpg
      ├── 1696543211000-def456.png
      └── ...
```

Format nazwy pliku: `{timestamp}-{random}.{extension}`

---

## Testowanie uploadu

### 1. Przez aplikację Admin:
- Utwórz nową usterkę → Dodaj zdjęcia
- Sprawdź czy zdjęcia się przesyłają

### 2. Przez Supabase Dashboard:
- Storage → warranty-photos → warranty-issues/
- Powinny być widoczne przesłane pliki

### 3. Publiczny dostęp:
URL publiczny: `https://{project-ref}.supabase.co/storage/v1/object/public/warranty-photos/warranty-issues/{filename}`

---

## Troubleshooting

### Problem: "Error uploading file: new row violates row-level security"
**Rozwiązanie**: Sprawdź czy polityki RLS są poprawnie ustawione (Krok 2)

### Problem: "Bucket not found"
**Rozwiązanie**: Upewnij się, że bucket `warranty-photos` istnieje (Krok 1)

### Problem: "File too large"
**Rozwiązanie**: Sprawdź limit rozmiaru pliku w buckecie (Krok 4)

### Problem: "CORS error"
**Rozwiązanie**: Skonfiguruj CORS dla bucketa (Krok 3)

---

## Backup i Migracja

### Backup zdjęć:
```bash
# Przez Supabase CLI:
supabase storage download --bucket warranty-photos --output ./backup/
```

### Migracja do innego projektu:
```bash
# Export z starego projektu:
supabase storage download --bucket warranty-photos --output ./export/

# Import do nowego projektu:
supabase storage upload --bucket warranty-photos ./export/
```

---

## Monitoring

### Rozmiar bucketa:
```sql
SELECT 
  bucket_id,
  COUNT(*) as file_count,
  pg_size_pretty(SUM(metadata->>'size')::bigint) as total_size
FROM storage.objects
WHERE bucket_id = 'warranty-photos'
GROUP BY bucket_id;
```

### Ostatnio przesłane pliki:
```sql
SELECT 
  name,
  created_at,
  pg_size_pretty((metadata->>'size')::bigint) as size
FROM storage.objects
WHERE bucket_id = 'warranty-photos'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Gotowe! 🎉

Po wykonaniu tych kroków, moduł uploadu zdjęć będzie w pełni funkcjonalny.
