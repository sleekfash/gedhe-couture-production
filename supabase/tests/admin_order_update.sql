-- Run as postgres after the migration, with at least one existing admin.
-- All fixture writes and temporary privilege changes are rolled back.
BEGIN;
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.update_admin_order(uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.update_admin_order(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.update_admin_order(uuid,uuid,text,text)', 'EXECUTE')
    OR has_table_privilege('authenticated', 'public.orders', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL: browser privileges are not restricted';
  END IF;
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid;
  fixture uuid := gen_random_uuid();
  events integer;
BEGIN
  SELECT user_id INTO actor FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Test requires an existing admin'; END IF;
  INSERT INTO public.orders(id, reference, customer_name, total, payment_provider)
  VALUES(fixture, 'QA-RPC-ROLLBACK-TEST', 'QA transaction fixture', 4500, 'whatsapp');

  BEGIN
    PERFORM public.update_admin_order(fixture, gen_random_uuid(), NULL, 'unauthorized');
    RAISE EXCEPTION 'FAIL: non-admin actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.update_admin_order(gen_random_uuid(), actor, NULL, 'missing');
    RAISE EXCEPTION 'FAIL: missing order accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.update_admin_order(fixture, actor, 'delivered', 'invalid jump');
    RAISE EXCEPTION 'FAIL: invalid transition accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.update_admin_order(fixture, actor, NULL, repeat('x', 2001));
    RAISE EXCEPTION 'FAIL: overlong notes accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  PERFORM public.update_admin_order(fixture, actor, 'confirmed', 'QA confirmed');
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = fixture
    AND fulfilment_status = 'confirmed' AND admin_notes = 'QA confirmed'
    AND payment_status = 'pending' AND total = 4500) THEN
    RAISE EXCEPTION 'FAIL: save or payment-field isolation';
  END IF;
  SELECT count(*) INTO events FROM public.order_audit_events WHERE order_id = fixture;
  IF events <> 2 OR NOT EXISTS (SELECT 1 FROM public.order_audit_events WHERE order_id = fixture
    AND actor_user_id = actor AND event_type = 'fulfilment_status_changed'
    AND from_value = 'new' AND to_value = 'confirmed')
    OR NOT EXISTS (SELECT 1 FROM public.order_audit_events WHERE order_id = fixture
      AND actor_user_id = actor AND event_type = 'admin_note_updated' AND note = 'QA confirmed') THEN
    RAISE EXCEPTION 'FAIL: audit records';
  END IF;
  PERFORM public.update_admin_order(fixture, actor, 'confirmed', 'QA confirmed');
  IF (SELECT count(*) FROM public.order_audit_events WHERE order_id = fixture) <> events THEN
    RAISE EXCEPTION 'FAIL: duplicate audit on no-op';
  END IF;
  PERFORM public.update_admin_order(fixture, actor, 'packed', NULL);
  PERFORM public.update_admin_order(fixture, actor, 'dispatched', NULL);
  PERFORM public.update_admin_order(fixture, actor, 'delivered', NULL);
  BEGIN
    PERFORM public.update_admin_order(fixture, actor, 'new', NULL);
    RAISE EXCEPTION 'FAIL: terminal state reversal accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

-- Force an audit insert failure in this uncommitted transaction. Verify the
-- preceding order change is rolled back by the RPC, not partially persisted.
RESET ROLE;
REVOKE INSERT ON public.order_audit_events FROM service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE fixture uuid; actor uuid;
BEGIN
  SELECT id INTO fixture FROM public.orders WHERE reference = 'QA-RPC-ROLLBACK-TEST';
  SELECT user_id INTO actor FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  BEGIN
    PERFORM public.update_admin_order(fixture, actor, NULL, 'must not persist');
    RAISE EXCEPTION 'FAIL: audit failure was ignored';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT admin_notes FROM public.orders WHERE id = fixture) <> 'QA confirmed' THEN
    RAISE EXCEPTION 'FAIL: order changed despite failed audit';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: privileges, authorization, missing order, notes limit, transitions, payment isolation, auditing, no-op and atomic rollback' AS result;
