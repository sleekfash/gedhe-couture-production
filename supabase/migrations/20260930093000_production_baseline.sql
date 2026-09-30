-- Gedhe Couture production baseline.
-- Safe to run on a fresh project and idempotent for repeated deployments.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  variant text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  pattern text NOT NULL DEFAULT '',
  option_label text NOT NULL DEFAULT '',
  options text[] NOT NULL DEFAULT '{}'::text[],
  min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty > 0),
  price_ngn numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_ngn >= 0),
  price_gbp numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_gbp >= 0),
  volume_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  stock_status text NOT NULL DEFAULT 'In Stock',
  image_url text NOT NULL DEFAULT '',
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  admin_notes text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'GBP')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  volume integer NOT NULL DEFAULT 0 CHECK (volume >= 0),
  payment_provider text NOT NULL DEFAULT 'whatsapp'
    CHECK (payment_provider IN ('stripe', 'paystack', 'whatsapp')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  fulfilment_status text NOT NULL DEFAULT 'new'
    CHECK (fulfilment_status IN ('new', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled')),
  provider_reference text,
  provider_checkout_url text,
  lookup_token_hash text,
  lookup_expires_at timestamptz,
  lookup_revoked_at timestamptz,
  payment_attempts integer NOT NULL DEFAULT 0 CHECK (payment_attempts >= 0),
  last_payment_error text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('stripe', 'paystack')),
  event_id text NOT NULL,
  event_type text NOT NULL DEFAULT '',
  order_reference text,
  payload_hash text,
  processed_at timestamptz,
  failure_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.order_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_reference text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  note text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_lookup_token_hash_unique_idx
  ON public.orders (lookup_token_hash) WHERE lookup_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_fulfilment_status_idx ON public.orders (fulfilment_status);
CREATE INDEX IF NOT EXISTS payment_events_order_reference_idx ON public.payment_events (order_reference);
CREATE INDEX IF NOT EXISTS payment_events_received_at_idx ON public.payment_events (received_at DESC);
CREATE INDEX IF NOT EXISTS order_audit_events_order_id_idx ON public.order_audit_events (order_id);

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published products are public" ON public.products;
CREATE POLICY "Published products are public"
ON public.products FOR SELECT TO anon, authenticated
USING (published = true);

DROP POLICY IF EXISTS "Admins can view all products" ON public.products;
CREATE POLICY "Admins can view all products"
ON public.products FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins can insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update products" ON public.products;
CREATE POLICY "Admins can update products"
ON public.products FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins can delete products"
ON public.products FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view orders" ON public.orders;
CREATE POLICY "Admins can view orders"
ON public.orders FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
ON public.orders FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view payment events" ON public.payment_events;
CREATE POLICY "Admins can view payment events"
ON public.payment_events FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view order audit events" ON public.order_audit_events;
CREATE POLICY "Admins can view order audit events"
ON public.order_audit_events FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.payment_events TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.order_audit_events TO authenticated;

GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.payment_events TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.order_audit_events TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_audit_events FROM anon, authenticated;

INSERT INTO public.products (
  code, name, category, variant, description, pattern, option_label, options,
  min_qty, price_ngn, price_gbp, volume_tiers, stock_status, image_url,
  gallery, published, sort_order
)
VALUES
  ('ANK-001', 'Premium 100% Cotton Ankara', 'Fabrics', '3-Yard Bundle',
   'Authentic, high-grade cotton weave featuring traditional vibrant print styling.',
   'Heritage wax print', 'Choose a print', ARRAY['Ochre Bloom', 'Indigo Grid', 'Coral Vine'],
   1, 3000, 7.5, '[]'::jsonb, 'In Stock', 'asset:product-fabric.jpg',
   '[{"src":"asset:detail-fabric-macro.jpg","caption":"Cotton wax print detail"},{"src":"asset:detail-fabric-stack.jpg","caption":"Three-yard fabric bundle"}]'::jsonb,
   true, 1),
  ('RTW-002', 'Elegance Bubu Gown', 'Ready-to-Wear', 'Free Size',
   'Flowing, sophisticated silhouette engineered for modern everyday luxury.',
   'Sculptural floral', 'Select a print', ARRAY['Ochre Bloom', 'Coral Vine'],
   1, 12500, 32, '[]'::jsonb, 'Limited Stock', 'asset:product-bubu.jpg',
   '[{"src":"asset:detail-bubu-macro.jpg","caption":"Print and finish detail"},{"src":"asset:detail-bubu-full.jpg","caption":"Full bubu silhouette"}]'::jsonb,
   true, 2),
  ('RTW-003', 'Tailored Palazzo Trousers', 'Ready-to-Wear', 'Adjustable Waist',
   'Wide-leg cut with premium pattern alignment across all structural seams.',
   'Geometric wax print', 'Select a print', ARRAY['Indigo Grid', 'Ochre Bloom'],
   1, 8500, 22, '[]'::jsonb, 'In Stock', 'asset:product-palazzo.jpg',
   '[{"src":"asset:detail-palazzo-macro.jpg","caption":"Pattern alignment detail"},{"src":"asset:detail-palazzo-styled.jpg","caption":"Styled palazzo silhouette"}]'::jsonb,
   true, 3),
  ('ASO-004', 'Custom Asoebi Bulk Supply', 'Asoebi', 'Minimum 10 Packs',
   'High-volume fabric pairing and coordination tailored for traditional event sizing.',
   'Coordinated event print', 'Choose a print', ARRAY['Ochre Bloom', 'Indigo Grid', 'Coral Vine'],
   10, 2800, 7,
   '[{"minQty":10,"label":"10–24 packs","unitPriceNgn":2800,"unitPriceGbp":7},{"minQty":25,"label":"25–49 packs","unitPriceNgn":2500,"unitPriceGbp":6.25},{"minQty":50,"label":"50+ packs","unitPriceNgn":2200,"unitPriceGbp":5.5}]'::jsonb,
   'Inquire for Timeline', 'asset:product-asoebi.jpg',
   '[{"src":"asset:detail-asoebi-macro.jpg","caption":"Asoebi print detail"},{"src":"asset:detail-asoebi-bulk.jpg","caption":"Bulk coordination selection"}]'::jsonb,
   true, 4)
ON CONFLICT (code) DO NOTHING;
