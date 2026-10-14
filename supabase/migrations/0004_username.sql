-- Review only. Do not run until this file is approved.
-- Adds a login name. Does not delete users or orders and does not change RLS.
-- A signed-in user still cannot change role. Username is fixed for that user too.
-- The SQL editor, where auth.uid() is null, can set role and username.

ALTER TABLE public.profiles
  ADD COLUMN username text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (
    username IS NULL
    OR username ~ '^[a-z0-9][a-z0-9_]{2,23}$'
  );

CREATE UNIQUE INDEX profiles_username_unique
  ON public.profiles (username);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chosen text;
BEGIN
  chosen := NULLIF(btrim(NEW.raw_user_meta_data ->> 'username'), '');
  IF chosen IS NOT NULL THEN
    chosen := lower(chosen);
    IF chosen !~ '^[a-z0-9][a-z0-9_]{2,23}$' THEN
      RAISE EXCEPTION 'invalid username';
    END IF;
  END IF;
  INSERT INTO public.profiles (id, role, username)
  VALUES (NEW.id, 'customer', chosen);
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username taken';
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  IF auth.uid() IS NOT NULL THEN
    NEW.role := OLD.role;
    NEW.username := OLD.username;
  ELSIF NEW.username IS NOT NULL THEN
    NEW.username := NULLIF(lower(btrim(NEW.username)), '');
  END IF;
  IF NEW.full_name IS NOT NULL THEN
    NEW.full_name := NULLIF(btrim(NEW.full_name), '');
    IF NEW.full_name IS NOT NULL AND char_length(NEW.full_name) > 80 THEN
      RAISE EXCEPTION 'invalid profile';
    END IF;
  END IF;
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := NULLIF(btrim(NEW.phone), '');
    IF NEW.phone IS NOT NULL AND char_length(NEW.phone) > 20 THEN
      RAISE EXCEPTION 'invalid profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC, anon, authenticated;
