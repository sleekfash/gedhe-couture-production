BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_request_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_request_id_idx ON public.orders(checkout_request_id);
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'received';
CREATE TABLE IF NOT EXISTS public.payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id),
 attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 5), provider text NOT NULL CHECK(provider IN ('stripe','paystack')),
 status text NOT NULL DEFAULT 'initializing' CHECK(status IN ('initializing','ready','paid','failed','expired')),
 provider_reference text, checkout_url text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,attempt), UNIQUE(provider,provider_reference)
);
CREATE TABLE IF NOT EXISTS public.product_inventory (
 product_id uuid NOT NULL REFERENCES public.products(id), option text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(product_id,option)
);
CREATE TABLE IF NOT EXISTS public.stock_reservations (
 order_id uuid NOT NULL REFERENCES public.orders(id), product_id uuid NOT NULL REFERENCES public.products(id),
 option text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','consumed','released','exception')),
 PRIMARY KEY(order_id,product_id,option)
);
CREATE INDEX IF NOT EXISTS stock_reservations_active_idx ON public.stock_reservations(product_id,option,expires_at) WHERE status='reserved';
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_attempts,public.product_inventory,public.stock_reservations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payment_attempts,public.product_inventory,public.stock_reservations TO service_role;

-- The caller is a trusted server, but prices/options are re-read here under locks.
CREATE OR REPLACE FUNCTION public.create_checkout_order(p_request_id uuid,p_hash text,p_token_hash text,p_reference text,p_currency text,p_provider text,p_customer jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; p public.products%ROWTYPE; line record; inv public.product_inventory%ROWTYPE;
 tiers jsonb; tier jsonb; qty integer; unit numeric; subtotal numeric:=0; fee numeric; volume integer:=0;
 priced jsonb:='[]'; available integer; sku text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO o FROM public.orders WHERE checkout_request_id=p_request_id;
 IF FOUND THEN
  IF o.checkout_request_hash IS DISTINCT FROM p_hash OR o.lookup_token_hash IS DISTINCT FROM p_token_hash THEN
   RAISE EXCEPTION 'Checkout details changed. Please submit again.' USING ERRCODE='22023';
  END IF;
  RETURN to_jsonb(o);
 END IF;
 IF p_currency NOT IN ('NGN','GBP') OR p_provider NOT IN ('stripe','paystack','whatsapp') OR
 (p_provider='stripe' AND p_currency<>'GBP') OR (p_provider='paystack' AND p_currency<>'NGN') OR
 jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 40 THEN
  RAISE EXCEPTION 'Invalid checkout.' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE x->>'qty' IS NULL OR (x->>'qty')::integer NOT BETWEEN 1 AND 5000) THEN RAISE EXCEPTION 'Invalid item quantity.' USING ERRCODE='22023'; END IF;
 -- Deterministic product lock order also serializes stock adjustments with checkout.
 PERFORM 1 FROM public.products WHERE id IN (SELECT (x->>'productId')::uuid FROM jsonb_array_elements(p_items) x) ORDER BY id FOR UPDATE;
 FOR line IN SELECT (x->>'productId')::uuid AS id,x->>'option' AS option,sum((x->>'qty')::integer)::integer AS qty
  FROM jsonb_array_elements(p_items) x GROUP BY 1,2 ORDER BY 1,2 LOOP
  SELECT * INTO p FROM public.products WHERE id=line.id;
  IF NOT FOUND OR NOT p.published THEN RAISE EXCEPTION 'An item is no longer available.' USING ERRCODE='22023'; END IF;
  IF line.option IS NULL OR NOT line.option=ANY(p.options) THEN RAISE EXCEPTION 'Choose an available product option.' USING ERRCODE='22023'; END IF;
  qty:=line.qty;
  IF qty IS NULL OR qty<p.min_qty OR qty>5000 THEN RAISE EXCEPTION 'Check the minimum and maximum quantity.' USING ERRCODE='22023'; END IF;
  unit:=CASE p_currency WHEN 'NGN' THEN p.price_ngn ELSE p.price_gbp END;
  tiers:=p.volume_tiers;
  IF jsonb_typeof(tiers)<>'array' THEN RAISE EXCEPTION 'Product pricing needs review.' USING ERRCODE='22023'; END IF;
  FOR tier IN SELECT x FROM jsonb_array_elements(tiers) x ORDER BY (x->>'minQty')::integer LOOP
   IF (tier->>'minQty')::integer<=qty THEN unit:=CASE p_currency WHEN 'NGN' THEN (tier->>'unitPriceNgn')::numeric ELSE (tier->>'unitPriceGbp')::numeric END; END IF;
  END LOOP;
  IF unit IS NULL OR unit<=0 OR unit<>round(unit,2) THEN RAISE EXCEPTION 'Product pricing needs review.' USING ERRCODE='22023'; END IF;
  SELECT * INTO inv FROM public.product_inventory WHERE product_id=p.id AND option=line.option FOR UPDATE;
  IF FOUND THEN
   SELECT inv.quantity-COALESCE(sum(r.quantity),0) INTO available FROM public.stock_reservations r
    WHERE r.product_id=p.id AND r.option=line.option AND r.status='reserved' AND r.expires_at>now();
   IF available<qty THEN RAISE EXCEPTION 'Not enough stock for the selected option.' USING ERRCODE='22023'; END IF;
  END IF;
  sku:=upper(p.code)||'-'||upper(left(regexp_replace(line.option,'[^a-zA-Z0-9]+','','g'),6));
  priced:=priced||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name,'option',line.option,'sku',sku,'qty',qty,'unitPrice',unit,'lineTotal',round(unit*qty,2)));
  subtotal:=subtotal+round(unit*qty,2); volume:=volume+qty;
 END LOOP;
 fee:=CASE p_currency WHEN 'NGN' THEN 3500 ELSE 18 END;
 INSERT INTO public.orders(reference,customer_name,customer_phone,customer_email,city,address,notes,items,currency,subtotal,delivery_fee,total,volume,payment_provider,lookup_token_hash,lookup_expires_at,checkout_request_id,checkout_request_hash)
 VALUES(p_reference,p_customer->>'name',p_customer->>'phone',p_customer->>'email',p_customer->>'city',p_customer->>'address',COALESCE(p_customer->>'notes',''),priced,p_currency,subtotal,fee,subtotal+fee,volume,p_provider,p_token_hash,now()+interval '30 days',p_request_id,p_hash) RETURNING * INTO o;
 INSERT INTO public.stock_reservations(order_id,product_id,option,quantity,expires_at)
 SELECT o.id,(x->>'productId')::uuid,x->>'option',(x->>'qty')::integer,now()+CASE WHEN p_provider='whatsapp' THEN interval '24 hours' WHEN p_provider='stripe' THEN interval '1 hour' ELSE interval '30 minutes' END
 FROM jsonb_array_elements(priced) x JOIN public.product_inventory i ON i.product_id=(x->>'productId')::uuid AND i.option=x->>'option';
 RETURN to_jsonb(o);
END $$;

CREATE OR REPLACE FUNCTION public.begin_payment_attempt(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; a public.payment_attempts%ROWTYPE; r public.stock_reservations%ROWTYPE; available integer;
BEGIN
 SELECT * INTO o FROM public.orders WHERE lookup_token_hash=p_token_hash AND lookup_expires_at>now() AND lookup_revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This payment link is no longer valid.' USING ERRCODE='22023'; END IF;
 IF o.payment_status IN ('paid','refunded') OR o.fulfilment_status='cancelled' THEN RAISE EXCEPTION 'This order cannot accept another payment.' USING ERRCODE='22023'; END IF;
 IF o.payment_provider NOT IN ('stripe','paystack') THEN RAISE EXCEPTION 'This order is coordinated on WhatsApp.' USING ERRCODE='22023'; END IF;
 -- Before a retry can collect money, revalidate and renew this order's stock holds.
 PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM public.stock_reservations WHERE order_id=o.id AND status='reserved') ORDER BY id FOR UPDATE;
 FOR r IN SELECT * FROM public.stock_reservations WHERE order_id=o.id AND status='reserved' ORDER BY product_id,option FOR UPDATE LOOP
  SELECT quantity INTO available FROM public.product_inventory WHERE product_id=r.product_id AND option=r.option FOR UPDATE;
  available:=available-COALESCE((SELECT sum(quantity) FROM public.stock_reservations WHERE product_id=r.product_id AND option=r.option AND order_id<>o.id AND status='reserved' AND expires_at>now()),0);
  IF available IS NULL OR available<r.quantity THEN RAISE EXCEPTION 'Stock changed. Contact the atelier before paying.' USING ERRCODE='22023'; END IF;
  UPDATE public.stock_reservations SET expires_at=GREATEST(expires_at,now()+CASE WHEN o.payment_provider='stripe' THEN interval '1 hour' ELSE interval '30 minutes' END) WHERE order_id=r.order_id AND product_id=r.product_id AND option=r.option;
 END LOOP;
 -- Never create another payable attempt while one can still collect money.
 SELECT * INTO a FROM public.payment_attempts WHERE order_id=o.id ORDER BY attempt DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND a.status IN ('initializing','ready') THEN RETURN jsonb_build_object('order',to_jsonb(o),'attempt',to_jsonb(a)); END IF;
 IF o.payment_attempts>=5 THEN RAISE EXCEPTION 'Too many payment attempts. Contact the atelier.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.payment_attempts(order_id,attempt,provider,provider_reference)
 VALUES(o.id,o.payment_attempts+1,o.payment_provider,CASE WHEN o.payment_provider='paystack' THEN o.reference||'-P'||(o.payment_attempts+1)::text ELSE NULL END) RETURNING * INTO a;
 UPDATE public.orders SET payment_attempts=a.attempt WHERE id=o.id;
 RETURN jsonb_build_object('order',to_jsonb(o),'attempt',to_jsonb(a));
END $$;

CREATE OR REPLACE FUNCTION public.complete_payment_attempt(p_attempt_id uuid,p_provider_reference text,p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.payment_attempts%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.payment_attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment attempt missing.'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=a.order_id FOR UPDATE;
 SELECT * INTO a FROM public.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF a.provider_reference IS NOT NULL AND a.provider_reference<>p_provider_reference THEN RAISE EXCEPTION 'Payment attempt reference mismatch.'; END IF;
 UPDATE public.payment_attempts SET provider_reference=p_provider_reference,checkout_url=p_url,status=CASE WHEN status='initializing' THEN 'ready' ELSE status END WHERE id=a.id;
 IF o.payment_status NOT IN ('paid','refunded') AND a.attempt=o.payment_attempts THEN
  UPDATE public.orders SET provider_reference=p_provider_reference,provider_checkout_url=p_url WHERE id=o.id;
 END IF;
 RETURN jsonb_build_object('checkoutUrl',p_url,'alreadyPaid',o.payment_status='paid');
END $$;

-- Event insertion, payment transition, inventory consumption and audit are one transaction.
-- A transient error rolls the entire operation back, so delivery retries can recover.
CREATE OR REPLACE FUNCTION public.apply_payment_event(p_provider text,p_event_id text,p_event_type text,p_reference text,p_provider_reference text,p_outcome text,p_amount bigint,p_currency text,p_attempt_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; e public.payment_events%ROWTYPE; a public.payment_attempts%ROWTYPE; reason text;
BEGIN
 SELECT * INTO o FROM public.orders WHERE reference=p_reference FOR UPDATE;
 IF NOT FOUND AND p_outcome<>'ignored' THEN RAISE EXCEPTION 'Order not yet available.' USING ERRCODE='40001'; END IF;
 INSERT INTO public.payment_events(provider,event_id,event_type,order_reference,processing_status)
 VALUES(p_provider,p_event_id,p_event_type,p_reference,'received') ON CONFLICT(provider,event_id) DO NOTHING;
 SELECT * INTO e FROM public.payment_events WHERE provider=p_provider AND event_id=p_event_id FOR UPDATE;
 IF e.processed_at IS NOT NULL THEN RETURN jsonb_build_object('status',e.processing_status,'duplicate',true); END IF;
 IF p_outcome NOT IN ('paid','failed','expired','ignored','pending') THEN RAISE EXCEPTION 'Invalid payment outcome.'; END IF;
 IF p_outcome='ignored' THEN
  UPDATE public.payment_events SET processing_status='ignored',processed_at=now() WHERE id=e.id; RETURN jsonb_build_object('status','ignored');
 END IF;
 SELECT * INTO a FROM public.payment_attempts WHERE order_id=o.id AND provider=p_provider AND provider_reference=p_provider_reference FOR UPDATE;
 IF NOT FOUND AND p_provider='stripe' AND p_attempt_id IS NOT NULL THEN
  SELECT * INTO a FROM public.payment_attempts WHERE id=p_attempt_id AND order_id=o.id AND provider=p_provider AND provider_reference IS NULL AND status='initializing' FOR UPDATE;
  IF FOUND THEN UPDATE public.payment_attempts SET provider_reference=p_provider_reference WHERE id=a.id; END IF;
 END IF;
 IF o.payment_provider<>p_provider THEN reason:='payment_provider_mismatch';
 ELSIF a.id IS NULL AND NOT COALESCE((o.checkout_request_id IS NULL AND o.provider_reference=p_provider_reference),false) THEN reason:='payment_attempt_mismatch';
 ELSIF p_outcome='paid' AND (p_amount IS DISTINCT FROM round(o.total*100)::bigint OR upper(p_currency) IS DISTINCT FROM o.currency) THEN reason:='amount_or_currency_mismatch'; END IF;
 IF reason IS NOT NULL THEN
  UPDATE public.orders SET last_payment_error=reason WHERE id=o.id;
  INSERT INTO public.order_audit_events(order_id,order_reference,event_type,note) VALUES(o.id,o.reference,'payment_exception',reason);
  UPDATE public.payment_events SET processing_status='rejected',failure_reason=reason,processed_at=now() WHERE id=e.id;
  RETURN jsonb_build_object('status','rejected','reason',reason);
 END IF;
 IF p_outcome='paid' THEN
  IF o.payment_status='refunded' THEN
   reason:='payment_after_refund';
  ELSIF o.payment_status<>'paid' THEN
   UPDATE public.orders SET payment_status='paid',paid_at=now(),last_payment_error=NULL WHERE id=o.id;
   UPDATE public.payment_attempts SET status='paid' WHERE id=a.id;
   INSERT INTO public.order_audit_events(order_id,order_reference,event_type,from_value,to_value,note)
    VALUES(o.id,o.reference,'payment_confirmed',o.payment_status,'paid','Verified '||p_provider||' payment.');
  ELSIF a.status IS DISTINCT FROM 'paid' AND a.id IS NOT NULL THEN
   reason:='additional_payment_received';
  END IF;
  IF o.fulfilment_status='cancelled' THEN reason:='payment_for_cancelled_order'; END IF;
 ELSIF p_outcome IN ('failed','expired') THEN
  UPDATE public.payment_attempts SET status=p_outcome WHERE id=a.id AND status<>'paid';
  IF o.payment_status NOT IN ('paid','refunded') AND (a.attempt=o.payment_attempts OR a.id IS NULL) THEN
   UPDATE public.orders SET payment_status='failed',last_payment_error=p_event_type WHERE id=o.id;
   INSERT INTO public.order_audit_events(order_id,order_reference,event_type,from_value,to_value,note) VALUES(o.id,o.reference,'payment_failed',o.payment_status,'failed',p_event_type);
  END IF;
 END IF;
 IF reason IS NOT NULL THEN
  UPDATE public.orders SET last_payment_error=reason WHERE id=o.id;
  INSERT INTO public.order_audit_events(order_id,order_reference,event_type,note) VALUES(o.id,o.reference,'payment_exception',reason);
 END IF;
 UPDATE public.payment_events SET processing_status=CASE WHEN reason IS NULL THEN 'applied' ELSE 'rejected' END,processed_at=now(),failure_reason=reason WHERE id=e.id;
 RETURN jsonb_build_object('status',CASE WHEN reason IS NULL THEN 'applied' ELSE 'rejected' END);
END $$;

CREATE OR REPLACE FUNCTION public.admin_order_metrics(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('total',count(*),'newOrders',count(*) FILTER(WHERE fulfilment_status='new'),'unpaid',count(*) FILTER(WHERE payment_status='pending'),'backlog',count(*) FILTER(WHERE fulfilment_status IN ('new','confirmed','packed','dispatched')),'exceptions',count(*) FILTER(WHERE last_payment_error IS NOT NULL OR payment_status='failed'),'paidNgn',COALESCE(sum(total) FILTER(WHERE payment_status='paid' AND currency='NGN'),0),'paidGbp',COALESCE(sum(total) FILTER(WHERE payment_status='paid' AND currency='GBP'),0)) FROM public.orders);
END $$;
CREATE OR REPLACE FUNCTION public.record_manual_payment(p_order_id uuid,p_actor uuid,p_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(trim(p_reference)) NOT BETWEEN 4 AND 160 THEN RAISE EXCEPTION 'Enter the verified bank receipt reference.' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_provider<>'whatsapp' OR o.fulfilment_status='cancelled' THEN RAISE EXCEPTION 'This order cannot receive a manual payment.' USING ERRCODE='22023'; END IF;
 IF o.payment_status='paid' THEN RETURN jsonb_build_object('ok',true); END IF;
 IF o.payment_status='refunded' THEN RAISE EXCEPTION 'A refunded order cannot be marked paid.' USING ERRCODE='22023'; END IF;
 UPDATE public.orders SET payment_status='paid',paid_at=now(),last_payment_error=NULL WHERE id=o.id;
 INSERT INTO public.order_audit_events(order_id,order_reference,actor_user_id,event_type,from_value,to_value,note)
 VALUES(o.id,o.reference,p_actor,'manual_payment_confirmed',o.payment_status,'paid','Bank receipt verified: '||trim(p_reference));
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.set_product_inventory(p_actor uuid,p_product_id uuid,p_option text,p_quantity integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE held integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.products WHERE id=p_product_id AND p_option=ANY(options) FOR UPDATE;
 IF NOT FOUND OR p_quantity<0 THEN RAISE EXCEPTION 'Check the product option and stock quantity.' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(sum(quantity),0) INTO held FROM public.stock_reservations WHERE product_id=p_product_id AND option=p_option AND status='reserved' AND expires_at>now();
 IF p_quantity<held THEN RAISE EXCEPTION 'Quantity cannot be below active reservations.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.product_inventory(product_id,option,quantity) VALUES(p_product_id,p_option,p_quantity)
 ON CONFLICT(product_id,option) DO UPDATE SET quantity=excluded.quantity,updated_at=now();
 RETURN jsonb_build_object('ok',true);
END $$;

-- Consume held stock once, either on payment or an explicit staff confirmation.
CREATE OR REPLACE FUNCTION public.consume_order_stock() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.stock_reservations%ROWTYPE; n integer;
BEGIN
 PERFORM 1 FROM public.products WHERE id IN (SELECT product_id FROM public.stock_reservations WHERE order_id=NEW.id AND status='reserved') ORDER BY id FOR UPDATE;
 IF NEW.fulfilment_status='cancelled' THEN UPDATE public.stock_reservations SET status='released' WHERE order_id=NEW.id AND status='reserved'; END IF;
 IF (NEW.payment_status='paid' AND OLD.payment_status<>'paid') OR (NEW.fulfilment_status='confirmed' AND OLD.fulfilment_status='new') THEN
  FOR r IN SELECT * FROM public.stock_reservations WHERE order_id=NEW.id AND status='reserved' ORDER BY product_id,option FOR UPDATE LOOP
   UPDATE public.product_inventory SET quantity=quantity-r.quantity,updated_at=now()
   WHERE product_id=r.product_id AND option=r.option AND quantity-r.quantity>=COALESCE((SELECT sum(quantity) FROM public.stock_reservations WHERE product_id=r.product_id AND option=r.option AND order_id<>NEW.id AND status='reserved' AND expires_at>now()),0);
   GET DIAGNOSTICS n=ROW_COUNT;
   UPDATE public.stock_reservations SET status=CASE WHEN n=1 THEN 'consumed' ELSE 'exception' END WHERE order_id=r.order_id AND product_id=r.product_id AND option=r.option;
   IF n=0 THEN
    NEW.last_payment_error:='stock_requires_review';
    INSERT INTO public.order_audit_events(order_id,order_reference,event_type,note) VALUES(NEW.id,NEW.reference,'stock_exception','Payment/confirmation arrived after stock was allocated elsewhere. Contact customer before dispatch.');
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_consume_stock ON public.orders;
CREATE TRIGGER orders_consume_stock BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.consume_order_stock();

REVOKE ALL ON FUNCTION public.create_checkout_order(uuid,text,text,text,text,text,jsonb,jsonb),public.begin_payment_attempt(text),public.complete_payment_attempt(uuid,text,text),public.apply_payment_event(text,text,text,text,text,text,bigint,text,uuid),public.admin_order_metrics(uuid),public.record_manual_payment(uuid,uuid,text),public.set_product_inventory(uuid,uuid,text,integer),public.consume_order_stock() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_order(uuid,text,text,text,text,text,jsonb,jsonb),public.begin_payment_attempt(text),public.complete_payment_attempt(uuid,text,text),public.apply_payment_event(text,text,text,text,text,text,bigint,text,uuid),public.admin_order_metrics(uuid),public.record_manual_payment(uuid,uuid,text),public.set_product_inventory(uuid,uuid,text,integer),public.consume_order_stock() TO service_role;
CREATE OR REPLACE FUNCTION public.product_stock_availability() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id',i.product_id,'option',i.option,'available',GREATEST(0,i.quantity-COALESCE((SELECT sum(r.quantity) FROM public.stock_reservations r WHERE r.product_id=i.product_id AND r.option=i.option AND r.status='reserved' AND r.expires_at>now()),0)))), '[]'::jsonb)
 FROM public.product_inventory i JOIN public.products p ON p.id=i.product_id AND p.published;
$$;
REVOKE ALL ON FUNCTION public.product_stock_availability() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_availability() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
