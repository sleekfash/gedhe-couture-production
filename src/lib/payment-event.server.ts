import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { NormalizedPaymentEvent } from "./payment-event";
export async function applyPaymentEvent(event: NormalizedPaymentEvent) {
  const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
  assertWritableEnvironment();
  const { data, error } = await supabaseAdmin.rpc("apply_payment_event", {
    p_provider: event.provider,
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_reference: event.reference,
    p_provider_reference: event.providerReference,
    p_outcome: event.outcome,
    p_amount: event.amount,
    p_currency: event.currency,
    p_attempt_id:
      event.attemptId && /^[0-9a-f-]{36}$/i.test(event.attemptId) ? event.attemptId : null,
  });
  if (error) {
    console.error("Payment event transaction failed", {
      provider: event.provider,
      code: error.code,
    });
    throw new Error("Payment processing temporarily unavailable");
  }
  return data;
}
