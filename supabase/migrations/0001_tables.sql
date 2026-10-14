-- Review only. Do not run until the SQL is approved.
-- Plain Postgres for the existing HTML/CSS/JS site. No Next.js.
-- This file creates tables only. It does not grant access and does not connect the site.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_ils integer NOT NULL CHECK (price_ils >= 0 AND price_ils <= 9999),
  minutes integer NOT NULL CHECK (minutes >= 10 AND minutes <= 180),
  addon boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.weekly_hours (
  weekday smallint PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  status text NOT NULL CHECK (status IN ('closed', 'hours')),
  start_time time,
  end_time time,
  breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  CHECK (
    status = 'closed'
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE TABLE public.week_overrides (
  week_start date NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  status text NOT NULL CHECK (status IN ('closed', 'hours')),
  start_time time,
  end_time time,
  breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocked text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (week_start, weekday),
  CHECK (EXTRACT(DOW FROM week_start)::integer = 0),
  CHECK (
    status = 'closed'
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE TABLE public.date_exceptions (
  service_date date PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('closed', 'hours')),
  start_time time,
  end_time time,
  breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocked text[] NOT NULL DEFAULT '{}',
  CHECK (
    status = 'closed'
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE TABLE public.business_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  travel_minutes integer NOT NULL DEFAULT 10 CHECK (travel_minutes >= 0 AND travel_minutes <= 180)
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles (id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  adults integer NOT NULL CHECK (adults >= 0 AND adults <= 20),
  children integer NOT NULL CHECK (children >= 0 AND children <= 20),
  beards integer NOT NULL DEFAULT 0 CHECK (beards >= 0 AND beards <= adults),
  CHECK (adults + children >= 2),
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  service_minutes integer NOT NULL CHECK (service_minutes >= 10 AND service_minutes <= 600),
  travel_minutes integer NOT NULL CHECK (travel_minutes >= 0 AND travel_minutes <= 180),
  -- Service time only: [start, start + service_minutes).
  -- Travel is not stored in this range. A later visit must leave one travel gap before it starts.
  span tstzrange NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  city text,
  street text,
  house_number text,
  entrance text,
  floor text,
  apartment text,
  entry_code text,
  notes text,
  payment text CHECK (payment IN ('paybox', 'cash', 'transfer')),
  photo_path text,
  cancelled_by text CHECK (cancelled_by IN ('customer', 'admin')),
  cancelled_at timestamptz,
  -- Kept for a later one-time import. It is not an access key.
  local_order_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_no_overlap
  EXCLUDE USING gist (span WITH &&)
  WHERE (status IN ('pending', 'approved'));

CREATE INDEX orders_customer_id_idx ON public.orders (customer_id);
CREATE INDEX orders_appointment_date_idx ON public.orders (appointment_date);

CREATE TABLE public.admin_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders (id) ON DELETE CASCADE,
  notice_type text NOT NULL,
  body text NOT NULL,
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.services (id, name, price_ils, minutes, addon) VALUES
  ('mens-haircut', 'תספורת גברים', 80, 30, false),
  ('kids-haircut', 'תספורת ילדים', 60, 30, false),
  ('beard', 'סידור זקן', 10, 10, true);

INSERT INTO public.business_settings (travel_minutes) VALUES (10);

INSERT INTO public.weekly_hours (weekday, status, start_time, end_time) VALUES
  (0, 'hours', '17:00', '21:00'),
  (1, 'hours', '17:00', '21:00'),
  (2, 'hours', '17:00', '21:00'),
  (3, 'hours', '17:00', '21:00'),
  (4, 'hours', '17:00', '21:00'),
  (5, 'hours', '09:00', '12:00'),
  (6, 'closed', NULL, NULL);
