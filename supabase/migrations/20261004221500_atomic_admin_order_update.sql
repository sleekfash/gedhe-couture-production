-- Order writes remain unavailable to browser clients. The authenticated server
-- checks admin membership before calling this service-role-only operation.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_admin_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_fulfilment_status text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  next_status text;
  next_notes text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_actor_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002';
  END IF;

  next_status := COALESCE(p_fulfilment_status, current_order.fulfilment_status);
  next_notes := COALESCE(p_admin_notes, current_order.admin_notes);
  IF char_length(next_notes) > 2000 THEN
    RAISE EXCEPTION 'Internal notes must be 2000 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  IF next_status <> current_order.fulfilment_status AND NOT (
    (current_order.fulfilment_status = 'new' AND next_status IN ('confirmed', 'cancelled')) OR
    (current_order.fulfilment_status = 'confirmed' AND next_status IN ('packed', 'cancelled')) OR
    (current_order.fulfilment_status = 'packed' AND next_status IN ('dispatched', 'cancelled')) OR
    (current_order.fulfilment_status = 'dispatched' AND next_status IN ('delivered', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'That fulfilment transition is not allowed.' USING ERRCODE = '22023';
  END IF;

  IF next_status IS DISTINCT FROM current_order.fulfilment_status OR
     next_notes IS DISTINCT FROM current_order.admin_notes THEN
    UPDATE public.orders
    SET fulfilment_status = next_status, admin_notes = next_notes
    WHERE id = p_order_id;
  END IF;

  IF next_status IS DISTINCT FROM current_order.fulfilment_status THEN
    INSERT INTO public.order_audit_events
      (order_id, order_reference, actor_user_id, event_type, from_value, to_value)
    VALUES (p_order_id, current_order.reference, p_actor_user_id,
      'fulfilment_status_changed', current_order.fulfilment_status, next_status);
  END IF;
  IF next_notes IS DISTINCT FROM current_order.admin_notes THEN
    INSERT INTO public.order_audit_events
      (order_id, order_reference, actor_user_id, event_type, note)
    VALUES (p_order_id, current_order.reference, p_actor_user_id,
      'admin_note_updated', next_notes);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_admin_order(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_order(uuid, uuid, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
