import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { Currency } from "@/data/catalog";
import type { Database, Json } from "@/integrations/supabase/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type Attempt = Database["public"]["Tables"]["payment_attempts"]["Row"];
const checkoutSchema = z.object({
  requestId: z.string().uuid(),
  lookupToken: z.string().uuid(),
  currency: z.enum(["NGN", "GBP"]),
  provider: z.enum(["stripe", "paystack", "whatsapp"]),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30),
    email: z.string().trim().email().max(160).or(z.literal("")),
    city: z.string().trim().min(2).max(120),
    address: z.string().trim().min(4).max(400),
    notes: z.string().trim().max(600).default(""),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        option: z.string().trim().min(1).max(120),
        qty: z.number().int().min(1).max(5000),
      }),
    )
    .min(1)
    .max(40),
});
export interface CheckoutResult {
  reference: string;
  lookupToken: string;
  total: number;
  currency: Currency;
  checkoutUrl: string | null;
  items: { name: string; option: string; sku: string; qty: number; lineTotal: number }[];
  subtotal: number;
  delivery: number;
  volume: number;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function originFrom() {
  const request = getRequest();
  const current = new URL(request.url);
  const configured = process.env["PUBLIC_SITE_URL"];
  const site = configured ? new URL(configured) : current;
  // Never send opaque order links to an arbitrary caller-supplied Origin.
  const supplied = request.headers.get("origin");
  if (supplied && supplied !== current.origin && supplied !== site.origin)
    throw new Error("Checkout origin is not allowed.");
  return site.origin;
}
function dbError(error: { code?: string; message: string }, fallback: string): never {
  if (error.code === "22023") throw new Error(error.message);
  console.error(fallback, { code: error.code });
  throw new Error(fallback);
}
async function initializePayment(token: string): Promise<{ checkoutUrl: string }> {
  const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
  assertWritableEnvironment();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("begin_payment_attempt", {
    p_token_hash: await hash(token),
  });
  if (error) dbError(error, "Payment could not be started.");
  const { order, attempt } = data as unknown as { order: Order; attempt: Attempt };
  if (attempt.status === "ready" && attempt.checkout_url)
    return { checkoutUrl: attempt.checkout_url };
  const site = originFrom();
  let checkoutUrl: string;
  let providerReference: string;
  if (order.payment_provider === "stripe") {
    const secret = process.env["STRIPE_SECRET_KEY"];
    if (!secret) throw new Error("Stripe payment is not configured yet.");
    const body = new URLSearchParams({
      mode: "payment",
      client_reference_id: order.reference,
      "metadata[reference]": order.reference,
      "metadata[attempt_id]": attempt.id,
      customer_email: order.customer_email ?? "",
      success_url: `${site}/order/${token}`,
      cancel_url: `${site}/order/${token}?checkout=cancelled`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": String(Math.round(Number(order.total) * 100)),
      "line_items[0][price_data][product_data][name]": `Order ${order.reference} — Gedhe Couture`,
      expires_at: String(Math.floor(new Date(attempt.created_at).getTime() / 1000) + 3600),
    });
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": attempt.id,
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const payload = (await response.json()) as { id?: string; url?: string };
    if (!response.ok || !payload.id || !payload.url)
      throw new Error(
        "Payment initialization needs recovery. Your order is saved; use its status link or contact the atelier.",
      );
    providerReference = payload.id;
    checkoutUrl = payload.url;
  } else {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) throw new Error("Paystack payment is not configured yet.");
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: order.customer_email,
        amount: Math.round(Number(order.total) * 100),
        currency: "NGN",
        reference: attempt.provider_reference,
        callback_url: `${site}/order/${token}`,
        metadata: {
          reference: order.reference,
          order_reference: order.reference,
          attempt_id: attempt.id,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = (await response.json()) as {
      status?: boolean;
      data?: { authorization_url?: string; reference?: string };
    };
    if (!response.ok || !payload.status || !payload.data?.authorization_url)
      throw new Error(
        "Payment initialization needs recovery. Your order is saved; use its status link or contact the atelier.",
      );
    providerReference = payload.data.reference ?? attempt.provider_reference!;
    checkoutUrl = payload.data.authorization_url;
  }
  const { error: saveError } = await supabaseAdmin.rpc("complete_payment_attempt", {
    p_attempt_id: attempt.id,
    p_provider_reference: providerReference,
    p_url: checkoutUrl,
  });
  if (saveError)
    dbError(
      saveError,
      "Payment is saved at the provider, but confirmation needs recovery. Contact the atelier.",
    );
  return { checkoutUrl };
}
export const startCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    originFrom();
    if (data.provider !== "whatsapp" && !data.customer.email)
      throw new Error("An email address is required for card payment.");
    if (
      (data.provider === "stripe" && !process.env["STRIPE_SECRET_KEY"]) ||
      (data.provider === "paystack" && !process.env["PAYSTACK_SECRET_KEY"])
    )
      throw new Error("Card payment is not configured yet. Please choose WhatsApp.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestId, lookupToken, ...details } = data;
    const { data: row, error } = await supabaseAdmin.rpc("create_checkout_order", {
      p_request_id: requestId,
      p_hash: await hash(JSON.stringify(details)),
      p_token_hash: await hash(lookupToken),
      p_reference: `3KB-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      p_currency: data.currency,
      p_provider: data.provider,
      p_customer: data.customer,
      p_items: data.items,
    });
    if (error) dbError(error, "Your order could not be saved. Please try again.");
    const order = row as unknown as Order;
    const result: CheckoutResult = {
      reference: order.reference,
      lookupToken,
      total: Number(order.total),
      currency: order.currency as Currency,
      checkoutUrl: null,
      items: order.items as unknown as CheckoutResult["items"],
      subtotal: Number(order.subtotal),
      delivery: Number(order.delivery_fee),
      volume: order.volume,
    };
    if (data.provider !== "whatsapp") {
      try {
        result.checkoutUrl = (await initializePayment(lookupToken)).checkoutUrl;
      } catch {
        result.checkoutUrl = `${originFrom()}/order/${lookupToken}?checkout=recovery`;
      }
    }
    return result;
  });
export interface PublicOrderStatus {
  reference: string;
  currency: Currency;
  subtotal: number;
  delivery_fee: number;
  total: number;
  volume: number;
  payment_provider: string;
  payment_status: string;
  fulfilment_status: string;
  items: CheckoutResult["items"];
  contact_hint: string;
}
export const getOrderByLookupToken = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<PublicOrderStatus | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .select(
        "reference,customer_phone,currency,subtotal,delivery_fee,total,volume,payment_provider,payment_status,fulfilment_status,items",
      )
      .eq("lookup_token_hash", await hash(data.token))
      .gt("lookup_expires_at", new Date().toISOString())
      .is("lookup_revoked_at", null)
      .maybeSingle();
    if (error) throw new Error("Order status is temporarily unavailable.");
    if (!row) return null;
    return {
      ...row,
      currency: row.currency as Currency,
      subtotal: Number(row.subtotal),
      delivery_fee: Number(row.delivery_fee),
      total: Number(row.total),
      items: row.items as unknown as CheckoutResult["items"],
      contact_hint: `WhatsApp ending ${row.customer_phone.slice(-4)}`,
    };
  });
export const getOrderByReference = getOrderByLookupToken;
export const retryOrderPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => initializePayment(data.token));
