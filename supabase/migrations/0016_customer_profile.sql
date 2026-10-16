-- Draft only. Do not run until it is explicitly approved.
-- Requires 0002 and 0004. Does not replace protect_profile_role, handle_new_user,
-- or any existing policy. profiles_select_own and profiles_update_own still limit
-- every customer to their own row.
-- full_name stays the single stored full name. When first_name or last_name changes,
-- full_name is rebuilt from them. phone stays in the existing column.
-- address holds the same parts as the booking form, as a JSON object.
-- photo_path holds a Storage path only. The image itself lives in the private
-- avatars bucket, never in this table.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text
    CHECK (first_name IS NULL OR char_length(first_name) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS last_name text
    CHECK (last_name IS NULL OR char_length(last_name) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS address jsonb
    CHECK (address IS NULL OR jsonb_typeof(address) = 'object'),
  ADD COLUMN IF NOT EXISTS photo_path text
    CHECK (photo_path IS NULL OR char_length(photo_path) BETWEEN 1 AND 200);

CREATE OR REPLACE FUNCTION public.profiles_tidy_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  part record;
  clean jsonb := '{}'::jsonb;
  limits constant jsonb := '{"city":60,"street":80,"house_number":20,"entrance":20,"floor":10,"apartment":20,"entry_code":20}';
  text_value text;
BEGIN
  NEW.first_name := NULLIF(btrim(NEW.first_name), '');
  NEW.last_name := NULLIF(btrim(NEW.last_name), '');
  IF NEW.first_name IS DISTINCT FROM OLD.first_name OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    NEW.full_name := NULLIF(left(concat_ws(' ', NEW.first_name, NEW.last_name), 80), '');
  END IF;

  IF NEW.address IS NOT NULL THEN
    FOR part IN SELECT key, value FROM jsonb_each(NEW.address) LOOP
      IF NOT limits ? part.key OR jsonb_typeof(part.value) <> 'string' THEN
        RAISE EXCEPTION 'invalid profile';
      END IF;
      text_value := NULLIF(btrim(part.value #>> '{}'), '');
      IF text_value IS NOT NULL THEN
        IF char_length(text_value) > (limits ->> part.key)::integer THEN
          RAISE EXCEPTION 'invalid profile';
        END IF;
        clean := clean || jsonb_build_object(part.key, text_value);
      END IF;
    END LOOP;
    NEW.address := NULLIF(clean, '{}'::jsonb);
  END IF;

  -- Only a file inside this profile's own folder of the avatars bucket.
  IF NEW.photo_path IS NOT NULL
     AND NEW.photo_path !~ ('^' || OLD.id::text || '/avatar-[0-9a-f-]{8,40}\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'invalid profile';
  END IF;
  RETURN NEW;
END;
$$;

-- Fires after profiles_protect_role, which keeps id, role and username.
DROP TRIGGER IF EXISTS profiles_tidy_details ON public.profiles;
CREATE TRIGGER profiles_tidy_details
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_tidy_details();

REVOKE ALL ON FUNCTION public.profiles_tidy_details() FROM PUBLIC, anon, authenticated;

GRANT UPDATE (first_name, last_name, address, photo_path) ON public.profiles TO authenticated;

-- Private bucket. Files are read through short-lived signed URLs only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Each signed-in user reaches only <their user id>/avatar-*.jpg|png|webp.
DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
CREATE POLICY avatars_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name ~ ('^' || auth.uid()::text || '/avatar-[0-9a-f-]{8,40}\.(jpg|png|webp)$')
  );

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (
    bucket_id = 'avatars'
    AND name ~ ('^' || auth.uid()::text || '/avatar-[0-9a-f-]{8,40}\.(jpg|png|webp)$')
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
