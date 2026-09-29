/**
 * Paystack payment callback. The raw body signature is verified before JSON
 * parsing, processing is idempotent, and server-authoritative totals are the
 * final gate before an order can be marked paid.
 */
import { createFileRoute } from "@tanstack/react-router";

import { validatePaystackCharge } from "@/lib/paystack-payment";
import { verifyPaystackSignature } from "@/lib/paystack-signature";

interface PaystackEvent {
  event?: string;
  data?: {
    id?: number | string;
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    metadata?: Record<string, unknown> | string | null;
  };
}

function orderReference(event: PaystackEvent) {
  let metadata = event.data?.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  if (metadata && typeof metadata === "object") {
    const reference = metadata["order_reference"] ?? metadata["reference"];
    if (typeof reference === "string" && reference !== "") return reference;
  }
  return event.data?.reference ?? null;
}

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) {
          console.error("paystack-webhook: PAYSTACK_SECRET_KEY is not configured");
          return new Response("Not configured", { status: 500 });
        }

        const signature = request.headers.get("x-paystack-signature") ?? "";
        const body = await request.text();
        if (!(await verifyPaystackSignature(signature, body, secret))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: PaystackEvent;
        try {
          event = JSON.parse(body) as PaystackEvent;
        } catch {
          return new Response("Malformed payload", { status: 400 });
        }

        const providerTransactionId = event.data?.id;
        const providerReference = event.data?.reference;
        if (!event.event || (!providerTransactionId && !providerReference)) {
          return new Response("Malformed payload", { status: 400 });
        }

        const reference = orderReference(event);
        const eventId = `${event.event}:${String(providerTransactionId ?? providerReference)}`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // The database unique rule on (provider, event_id) makes callback replays harmless.
        const { error: eventError } = await supabaseAdmin.from("payment_events").insert({
          provider: "paystack",
          event_id: eventId,
          event_type: event.event,
          order_reference: reference,
        });
        if (eventError) {
          if (eventError.code === "23505") return new Response("ok", { status: 200 });
          console.error("paystack-webhook: could not record event", eventError);
          return new Response("Storage error", { status: 500 });
        }

        const finish = async (failureReason?: string) => {
          await supabaseAdmin
            .from("payment_events")
            .update({
              processed_at: new Date().toISOString(),
              failure_reason: failureReason ?? null,
            })
            .eq("provider", "paystack")
            .eq("event_id", eventId);
          return new Response("ok", { status: 200 });
        };

        // Paystack recommends webhooks for successful transactions. Other events are recorded only.
        if (event.event !== "charge.success") return finish();
        if (!reference) return finish("missing_order_reference");

        const { data: order, error: orderError } = await supabaseAdmin
          .from("orders")
          .select("id, reference, currency, total, payment_provider, payment_status")
          .eq("reference", reference)
          .maybeSingle();
        if (orderError || !order) return finish("order_not_found");
        if (order.payment_provider !== "paystack") return finish("payment_provider_mismatch");

        const expectedMinor = Math.round(Number(order.total) * 100);
        const paidMinor = event.data?.amount ?? null;
        const paidCurrency = (event.data?.currency ?? "").toUpperCase();
        const failureReason = validatePaystackCharge(
          event.data ?? {},
          expectedMinor,
          order.currency,
        );
        if (failureReason) {
          await supabaseAdmin
            .from("orders")
            .update({ last_payment_error: failureReason })
            .eq("id", order.id);
          await supabaseAdmin.from("order_audit_events").insert({
            order_id: order.id,
            order_reference: order.reference,
            event_type: "payment_exception",
            from_value: `${expectedMinor} ${order.currency}`,
            to_value: `${paidMinor ?? "none"} ${paidCurrency || "none"}`,
            note:
              failureReason === "amount_or_currency_mismatch"
                ? "Paystack amount or currency did not match the order."
                : "Paystack callback did not report a successful transaction.",
          });
          return finish(failureReason);
        }

        if (order.payment_status !== "paid") {
          const paidAt = event.data?.paid_at;
          const { error: updateError } = await supabaseAdmin
            .from("orders")
            .update({
              payment_status: "paid",
              paid_at:
                paidAt && !Number.isNaN(Date.parse(paidAt)) ? paidAt : new Date().toISOString(),
              provider_reference: providerReference ?? String(providerTransactionId),
              last_payment_error: null,
            })
            .eq("id", order.id);
          if (updateError) {
            console.error("paystack-webhook: order update failed", updateError);
            return finish("order_update_failed");
          }
          await supabaseAdmin.from("order_audit_events").insert({
            order_id: order.id,
            order_reference: order.reference,
            event_type: "payment_confirmed",
            from_value: order.payment_status,
            to_value: "paid",
            note: "Verified Paystack payment callback.",
          });
        }

        return finish();
      },
    },
  },
});
