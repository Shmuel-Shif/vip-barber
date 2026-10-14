-- Review only. Do not run until the SQL is approved.
-- Identity: access follows auth.uid(), which equals profiles.id.
-- The site has no customer accounts yet. The later booking step signs in anonymously,
-- so Supabase creates the user and the session. The page does not invent the id.
-- Phone, local_order_key, and any id sent in the request do not appear in these policies.
-- A visitor who is not signed in still cannot read or create orders.
-- Every new auth user becomes customer. A signed-in user cannot change role to admin.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role cannot be changed by a signed-in user';
  END IF;
  NEW.id := OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role ON public.profiles;
CREATE TRIGGER profiles_protect_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_hours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.week_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.date_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notices FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.services FROM anon, authenticated;
REVOKE ALL ON public.weekly_hours FROM anon, authenticated;
REVOKE ALL ON public.week_overrides FROM anon, authenticated;
REVOKE ALL ON public.date_exceptions FROM anon, authenticated;
REVOKE ALL ON public.business_settings FROM anon, authenticated;
REVOKE ALL ON public.orders FROM anon, authenticated;
REVOKE ALL ON public.admin_notices FROM anon, authenticated;

GRANT SELECT ON public.services TO anon, authenticated;
GRANT SELECT ON public.weekly_hours TO anon, authenticated;
GRANT SELECT ON public.week_overrides TO anon, authenticated;
GRANT SELECT ON public.date_exceptions TO anon, authenticated;
GRANT SELECT ON public.business_settings TO anon, authenticated;
GRANT UPDATE ON public.business_settings TO authenticated;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, UPDATE ON public.admin_notices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.weekly_hours TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.week_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.date_exceptions TO authenticated;

CREATE POLICY services_read ON public.services
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY services_write ON public.services
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY weekly_hours_read ON public.weekly_hours
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY weekly_hours_write ON public.weekly_hours
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY week_overrides_read ON public.week_overrides
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY week_overrides_write ON public.week_overrides
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY date_exceptions_read ON public.date_exceptions
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY business_settings_read ON public.business_settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY business_settings_update ON public.business_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY date_exceptions_write ON public.date_exceptions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());

CREATE POLICY orders_update_own_or_admin ON public.orders
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin())
  WITH CHECK (customer_id = auth.uid() OR public.is_admin());

CREATE POLICY notices_admin ON public.admin_notices
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY notices_admin_update ON public.admin_notices
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
