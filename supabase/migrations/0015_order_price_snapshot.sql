-- Draft only. Do not run until it is explicitly approved.
-- Requires 0001 and 0003. Does not replace orders_prepare, request_appointment,
-- enqueue_order_notification, or any policy or grant.
-- Each new order keeps the unit price of every service it includes, copied from
-- services at insert time. A later price change in services does not touch it.
-- Orders created before this file keep NULL prices. No old price is guessed.
-- A service with a quantity of 0 in the order keeps a NULL price.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS adult_price_ils integer
    CHECK (adult_price_ils IS NULL OR (adult_price_ils >= 0 AND adult_price_ils <= 9999)),
  ADD COLUMN IF NOT EXISTS child_price_ils integer
    CHECK (child_price_ils IS NULL OR (child_price_ils >= 0 AND child_price_ils <= 9999)),
  ADD COLUMN IF NOT EXISTS beard_price_ils integer
    CHECK (beard_price_ils IS NULL OR (beard_price_ils >= 0 AND beard_price_ils <= 9999));

CREATE OR REPLACE FUNCTION public.orders_price_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.adult_price_ils := OLD.adult_price_ils;
    NEW.child_price_ils := OLD.child_price_ils;
    NEW.beard_price_ils := OLD.beard_price_ils;
    RETURN NEW;
  END IF;

  -- A missing service row leaves the price NULL and does not block the booking.
  NEW.adult_price_ils := CASE WHEN NEW.adults > 0
    THEN (SELECT price_ils FROM public.services WHERE id = 'mens-haircut') END;
  NEW.child_price_ils := CASE WHEN NEW.children > 0
    THEN (SELECT price_ils FROM public.services WHERE id = 'kids-haircut') END;
  NEW.beard_price_ils := CASE WHEN NEW.beards > 0
    THEN (SELECT price_ils FROM public.services WHERE id = 'beard') END;
  RETURN NEW;
END;
$$;

-- Fires after orders_prepare_row, so the quantities are already checked.
DROP TRIGGER IF EXISTS orders_price_snapshot_row ON public.orders;
CREATE TRIGGER orders_price_snapshot_row
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_price_snapshot();

REVOKE ALL ON FUNCTION public.orders_price_snapshot() FROM PUBLIC, anon, authenticated;
