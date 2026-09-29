/**
 * Stripe payment callback. Signature is verified against the raw body before
 * anything is parsed, processing is idempotent on (provider, event_id), and the
 * amount/currency must match the server-calculated order total.
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/stripe-signature";

interface StripeEvent {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      client_reference_id?: string | null;
      payment_intent?: string | null;
      amount_total?: number | null;
      amount?: number | null;
      currency?: string | null;
      metadata?: Record<string, string> | null;
    };
  };
}

const PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
const FAILED_EVENTS = new Set([
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
  "payment_intent.payment_failed",
]);

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) {
          console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET is not configured");
          return new Response("Not configured", { status: 500 });
        }

        const header = request.headers.get("stripe-signature") ?? "";
        const body = await request.text();
        if (!(await verifyStripeSignature(header, body, secret))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: StripeEvent;
        try {
          event = JSON.parse(body) as StripeEvent;
        } catch {
          return new Response("Malformed payload", { status: 400 });
        }
        if (!event.id || !event.type) return new Response("Malformed payload", { status: 400 });

        const object = event.data?.object ?? {};
        const reference = object.client_reference_id ?? object.metadata?.["reference"] ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: the unique (provider, event_id) rule rejects replays.
        const { error: eventError } = await supabaseAdmin.from("payment_events").insert({
          provider: "stripe",
          event_id: event.id,
          event_type: event.type,
          order_reference: reference,
        });
        if (eventError) {
          if (eventError.code === "23505") return new Response("ok", { status: 200 });
          console.error("stripe-webhook: could not record event", eventError);
          return new Response("Storage error", { status: 500 });
        }

        const finish = async (failureReason?: string) => {
          await supabaseAdmin
            .from("payment_events")
            .update({
              processed_at: new Date().toISOString(),
              failure_reason: failureReason ?? null,
            })
            .eq("provider", "stripe")
            .eq("event_id", event.id!);
          return new Response("ok", { status: 200 });
        };

        if (!PAID_EVENTS.has(event.type) && !FAILED_EVENTS.has(event.type)) {
          return finish();
        }
        if (!reference) return finish("missing_order_reference");

        const { data: order, error: orderError } = await supabaseAdmin
          .from("orders")
          .select("id, reference, currency, total, payment_status, payment_attempts")
          .eq("reference", reference)
          .maybeSingle();
        if (orderError || !order) return finish("order_not_found");

        if (FAILED_EVENTS.has(event.type)) {
          if (order.payment_status !== "paid") {
            await supabaseAdmin
              .from("orders")
              .update({ payment_status: "failed", last_payment_error: event.type })
              .eq("id", order.id);
            await supabaseAdmin.from("order_audit_events").insert({
              order_id: order.id,
              order_reference: order.reference,
              event_type: "payment_failed",
              from_value: order.payment_status,
              to_value: "failed",
              note: event.type,
            });
          }
          return finish(event.type);
        }

        // Paid path: amount and currency must match what the server calculated.
        const minor = object.amount_total ?? object.amount ?? null;
        const expectedMinor = Math.round(Number(order.total) * 100);
        const paidCurrency = (object.currency ?? "").toUpperCase();
        if (minor === null || minor !== expectedMinor || paidCurrency !== order.currency) {
          await supabaseAdmin
            .from("orders")
            .update({ last_payment_error: "amount_or_currency_mismatch" })
            .eq("id", order.id);
          await supabaseAdmin.from("order_audit_events").insert({
            order_id: order.id,
            order_reference: order.reference,
            event_type: "payment_exception",
            from_value: `${expectedMinor} ${order.currency}`,
            to_value: `${minor ?? "none"} ${paidCurrency || "none"}`,
            note: "Stripe amount or currency did not match the order.",
          });
          return finish("amount_or_currency_mismatch");
        }

        if (order.payment_status !== "paid") {
          const { error: updateError } = await supabaseAdmin
            .from("orders")
            .update({
              payment_status: "paid",
              paid_at: new Date().toISOString(),
              provider_reference: object.payment_intent ?? object.id ?? null,
              last_payment_error: null,
            })
            .eq("id", order.id);
          if (updateError) {
            console.error("stripe-webhook: order update failed", updateError);
            return finish("order_update_failed");
          }
          await supabaseAdmin.from("order_audit_events").insert({
            order_id: order.id,
            order_reference: order.reference,
            event_type: "payment_confirmed",
            from_value: order.payment_status,
            to_value: "paid",
            note: "Verified Stripe payment callback.",
          });
        }

        return finish();
      },
    },
  },
});
