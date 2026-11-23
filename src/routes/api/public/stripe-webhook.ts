import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/stripe-signature";
import { normalizeStripeEvent, type StripePaymentEvent } from "@/lib/payment-event";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        if (
          !(await verifyStripeSignature(
            request.headers.get("stripe-signature") ?? "",
            body,
            secret,
          ))
        )
          return new Response("Invalid signature", { status: 401 });
        let event;
        try {
          event = normalizeStripeEvent(JSON.parse(body) as StripePaymentEvent);
        } catch {
          return new Response("Malformed payload", { status: 400 });
        }
        try {
          const { applyPaymentEvent } = await import("@/lib/payment-event.server");
          await applyPaymentEvent(event);
          return new Response("ok", { status: 200 });
        } catch {
          return new Response("Please retry", { status: 503 });
        }
      },
    },
  },
});
