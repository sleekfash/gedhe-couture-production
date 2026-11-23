import { createFileRoute } from "@tanstack/react-router";
import { verifyPaystackSignature } from "@/lib/paystack-signature";
import { normalizePaystackEvent, type PaystackPaymentEvent } from "@/lib/payment-event";

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        if (
          !(await verifyPaystackSignature(
            request.headers.get("x-paystack-signature") ?? "",
            body,
            secret,
          ))
        )
          return new Response("Invalid signature", { status: 401 });
        let event;
        try {
          event = normalizePaystackEvent(JSON.parse(body) as PaystackPaymentEvent);
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
