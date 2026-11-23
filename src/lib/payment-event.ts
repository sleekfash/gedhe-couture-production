export interface StripePaymentEvent {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      client_reference_id?: string | null;
      amount_total?: number | null;
      amount?: number | null;
      currency?: string;
      payment_status?: string;
      metadata?: Record<string, string>;
    };
  };
}
export interface PaystackPaymentEvent {
  event?: string;
  data?: {
    id?: string | number;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, unknown> | string | null;
  };
}
export interface NormalizedPaymentEvent {
  provider: "stripe" | "paystack";
  eventId: string;
  eventType: string;
  reference: string | null;
  providerReference: string | null;
  attemptId?: string | null;
  outcome: "paid" | "failed" | "expired" | "ignored" | "pending";
  amount: number | null;
  currency: string | null;
}
export function normalizeStripeEvent(event: StripePaymentEvent): NormalizedPaymentEvent {
  if (!event.id || !event.type) throw new Error("Malformed event");
  const o = event.data?.object ?? {};
  let outcome: NormalizedPaymentEvent["outcome"] = "ignored";
  if (event.type === "checkout.session.completed")
    outcome = o.payment_status === "paid" ? "paid" : "pending";
  if (event.type === "checkout.session.async_payment_succeeded")
    outcome = o.payment_status === "paid" ? "paid" : "pending";
  if (event.type === "checkout.session.async_payment_failed") outcome = "failed";
  if (event.type === "checkout.session.expired") outcome = "expired";
  // payment_intent events lack the checkout-session binding; reconciliation uses the session.
  return {
    provider: "stripe",
    eventId: event.id,
    eventType: event.type,
    reference: o.client_reference_id ?? o.metadata?.["reference"] ?? null,
    providerReference: o.id ?? null,
    attemptId: o.metadata?.["attempt_id"] ?? null,
    outcome,
    amount: o.amount_total ?? o.amount ?? null,
    currency: o.currency?.toUpperCase() ?? null,
  };
}
export function normalizePaystackEvent(event: PaystackPaymentEvent): NormalizedPaymentEvent {
  const d = event.data ?? {};
  if (!event.event || (d.id == null && !d.reference)) throw new Error("Malformed event");
  let m = d.metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m) as Record<string, unknown>;
    } catch {
      m = null;
    }
  }
  const ref = m && typeof m === "object" ? (m["order_reference"] ?? m["reference"]) : null;
  return {
    provider: "paystack",
    eventId: `${event.event}:${String(d.id ?? d.reference)}`,
    eventType: event.event,
    reference: typeof ref === "string" ? ref : (d.reference?.replace(/-P\d+$/, "") ?? null),
    providerReference: d.reference ?? null,
    outcome: event.event === "charge.success" && d.status === "success" ? "paid" : "ignored",
    amount: d.amount ?? null,
    currency: d.currency?.toUpperCase() ?? null,
  };
}
