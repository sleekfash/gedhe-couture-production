/**
 * Checkout: server-authoritative pricing, order creation and hosted-payment
 * redirects. Client-supplied amounts are never trusted.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { DELIVERY_FEE, type Currency } from "@/data/catalog";

const checkoutSchema = z.object({
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

function makeReference() {
  return `3KB-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function paystackAttemptReference(orderReference: string, attempt: number) {
  return `${orderReference}-P${attempt}`;
}

async function hashLookupToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function skuFor(code: string, option: string) {
  return `${code.toUpperCase()}-${option
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 6)
    .toUpperCase()}`;
}

function originFrom(): string {
  const request = getRequest();
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const startCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const { createPublicClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicClient();
    const currency = data.currency as Currency;
    const lookupToken = crypto.randomUUID();
    const lookupTokenHash = await hashLookupToken(lookupToken);
    const lookupExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    if (data.provider !== "whatsapp" && data.customer.email === "") {
      throw new Error("An email address is required for card payment.");
    }
    if (
      (data.provider === "paystack" && currency !== "NGN") ||
      (data.provider === "stripe" && currency !== "GBP")
    ) {
      throw new Error("Selected payment route does not match the checkout currency.");
    }

    const ids = [...new Set(data.items.map((i) => i.productId))];
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, code, name, min_qty, price_ngn, price_gbp, volume_tiers, options, published")
      .in("id", ids);
    if (error) throw new Error("Could not price this order right now.");

    const priced = data.items.map((item) => {
      const row = rows?.find((r) => r.id === item.productId);
      if (!row || !row.published) throw new Error("An item in your bag is no longer available.");
      const qty = Math.max(item.qty, row.min_qty);
      const tiers = Array.isArray(row.volume_tiers)
        ? (row.volume_tiers as { minQty: number; unitPriceNgn: number; unitPriceGbp: number }[])
        : [];
      const base = currency === "NGN" ? Number(row.price_ngn) : Number(row.price_gbp);
      const unitPrice = tiers.reduce(
        (price, tier) =>
          qty >= Number(tier.minQty)
            ? Number(currency === "NGN" ? tier.unitPriceNgn : tier.unitPriceGbp)
            : price,
        base,
      );
      return {
        name: row.name,
        option: item.option,
        sku: skuFor(row.code, item.option),
        qty,
        unitPrice,
        lineTotal: Number((unitPrice * qty).toFixed(2)),
      };
    });

    const subtotal = Number(priced.reduce((n, l) => n + l.lineTotal, 0).toFixed(2));
    const delivery = DELIVERY_FEE[currency];
    const total = Number((subtotal + delivery).toFixed(2));
    const volume = priced.reduce((n, l) => n + l.qty, 0);
    const reference = makeReference();

    let checkoutUrl: string | null = null;
    let providerReference: string | null = null;

    if (data.provider === "stripe") {
      const secret = process.env["STRIPE_SECRET_KEY"];
      if (!secret) throw new Error("Card payment is not configured yet.");
      const body = new URLSearchParams();
      body.set("mode", "payment");
      body.set("client_reference_id", reference);
      body.set("metadata[reference]", reference);
      body.set("customer_email", data.customer.email);
      body.set("success_url", `${originFrom()}/order/${lookupToken}`);
      body.set("cancel_url", `${originFrom()}/?checkout=cancelled`);
      priced.forEach((line, i) => {
        body.set(`line_items[${i}][quantity]`, String(line.qty));
        body.set(`line_items[${i}][price_data][currency]`, "gbp");
        body.set(
          `line_items[${i}][price_data][unit_amount]`,
          String(Math.round(line.unitPrice * 100)),
        );
        body.set(
          `line_items[${i}][price_data][product_data][name]`,
          `${line.name} — ${line.option}`,
        );
      });
      body.set(`line_items[${priced.length}][quantity]`, "1");
      body.set(`line_items[${priced.length}][price_data][currency]`, "gbp");
      body.set(
        `line_items[${priced.length}][price_data][unit_amount]`,
        String(Math.round(delivery * 100)),
      );
      body.set(
        `line_items[${priced.length}][price_data][product_data][name]`,
        "Delivery & handling",
      );

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const payload = (await res.json()) as { id?: string; url?: string; error?: unknown };
      if (!res.ok || !payload.url) {
        console.error("Stripe session failed", payload.error ?? payload);
        throw new Error("Card payment could not be started. Please try again.");
      }
      checkoutUrl = payload.url;
      providerReference = payload.id ?? null;
    }

    if (data.provider === "paystack") {
      const secret = process.env["PAYSTACK_SECRET_KEY"];
      if (!secret) throw new Error("Paystack payment is not configured yet.");
      const paystackReference = paystackAttemptReference(reference, 1);
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.customer.email,
          amount: Math.round(total * 100),
          currency: "NGN",
          reference: paystackReference,
          callback_url: `${originFrom()}/order/${lookupToken}`,
          metadata: { reference, order_reference: reference },
        }),
      });
      const payload = (await res.json()) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; reference?: string };
      };
      if (!res.ok || !payload.status || !payload.data?.authorization_url) {
        console.error("Paystack init failed", payload.message ?? payload);
        throw new Error("Paystack payment could not be started. Please try again.");
      }
      checkoutUrl = payload.data.authorization_url;
      providerReference = payload.data.reference ?? paystackReference;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insertError } = await supabaseAdmin.from("orders").insert({
      reference,
      customer_name: data.customer.name,
      customer_phone: data.customer.phone,
      customer_email: data.customer.email,
      city: data.customer.city,
      address: data.customer.address,
      notes: data.customer.notes,
      items: priced,
      currency,
      subtotal,
      delivery_fee: delivery,
      total,
      volume,
      payment_provider: data.provider,
      payment_status: "pending",
      payment_attempts: data.provider === "whatsapp" ? 0 : 1,
      fulfilment_status: "new",
      provider_reference: providerReference,
      provider_checkout_url: checkoutUrl,
      lookup_token_hash: lookupTokenHash,
      lookup_expires_at: lookupExpiresAt,
    });
    if (insertError) {
      console.error("Order insert failed", insertError);
      throw new Error("Your order could not be saved. Please try again.");
    }

    return {
      reference,
      lookupToken,
      total,
      currency,
      checkoutUrl,
      items: priced.map(({ name, option, sku, qty, lineTotal }) => ({
        name,
        option,
        sku,
        qty,
        lineTotal,
      })),
      subtotal,
      delivery,
      volume,
    };
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
  items: { name: string; option: string; sku: string; qty: number; lineTotal: number }[];
  contact_hint: string;
}

/** Opaque-token lookup for the post-payment confirmation screen. */
export const getOrderByLookupToken = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ token: z.string().trim().uuid() }).parse(data))
  .handler(async ({ data }): Promise<PublicOrderStatus | null> => {
    const { createPublicClient } = await import("@/lib/supabase-public.server");
    const lookupTokenHash = await hashLookupToken(data.token);
    const { data: row, error } = await createPublicClient()
      .from("orders")
      .select(
        "reference, customer_phone, currency, subtotal, delivery_fee, total, volume, payment_provider, payment_status, fulfilment_status, items, lookup_expires_at, lookup_revoked_at",
      )
      .eq("lookup_token_hash", lookupTokenHash)
      .gt("lookup_expires_at", new Date().toISOString())
      .is("lookup_revoked_at", null)
      .maybeSingle();
    if (error || !row) return null;

    return {
      reference: row.reference,
      currency: row.currency as Currency,
      subtotal: Number(row.subtotal),
      delivery_fee: Number(row.delivery_fee),
      total: Number(row.total),
      volume: row.volume,
      payment_provider: row.payment_provider,
      payment_status: row.payment_status,
      fulfilment_status: row.fulfilment_status,
      items: (row.items as CheckoutResult["items"]) ?? [],
      contact_hint: row.customer_phone
        ? `WhatsApp ending ${row.customer_phone.slice(-4)}`
        : "Contact details received",
    };
  });

/** Kept as a compatibility alias for internal callers; it no longer accepts display references. */
export const getOrderByReference = getOrderByLookupToken;

/**
 * Restart payment for an existing unpaid card order. The same order row is
 * reused, so a retry can never create a duplicate order.
 */
export const retryOrderPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().trim().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ checkoutUrl: string }> => {
    const { createPublicClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicClient();
    const lookupTokenHash = await hashLookupToken(data.token);
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, reference, currency, total, customer_email, payment_status, payment_provider, payment_attempts",
      )
      .eq("lookup_token_hash", lookupTokenHash)
      .gt("lookup_expires_at", new Date().toISOString())
      .is("lookup_revoked_at", null)
      .maybeSingle();
    if (error || !order) throw new Error("This payment link is no longer valid.");
    if (order.payment_status === "paid") throw new Error("This order is already paid.");
    if (order.payment_provider !== "stripe" && order.payment_provider !== "paystack") {
      throw new Error("This order is settled with the atelier on WhatsApp.");
    }
    if (order.payment_attempts >= 5) {
      throw new Error("Too many payment attempts. Please contact the atelier on WhatsApp.");
    }

    let checkoutUrl: string;
    let providerReference: string | null = null;
    const nextAttempt = order.payment_attempts + 1;

    if (order.payment_provider === "stripe") {
      const secret = process.env["STRIPE_SECRET_KEY"];
      if (!secret) throw new Error("Stripe payment is not configured yet.");

      const body = new URLSearchParams();
      body.set("mode", "payment");
      body.set("client_reference_id", order.reference);
      body.set("metadata[reference]", order.reference);
      if (order.customer_email) body.set("customer_email", order.customer_email);
      body.set("success_url", `${originFrom()}/order/${data.token}`);
      body.set("cancel_url", `${originFrom()}/order/${data.token}?checkout=cancelled`);
      body.set("line_items[0][quantity]", "1");
      body.set("line_items[0][price_data][currency]", "gbp");
      body.set(
        "line_items[0][price_data][unit_amount]",
        String(Math.round(Number(order.total) * 100)),
      );
      body.set(
        "line_items[0][price_data][product_data][name]",
        `Order ${order.reference} — Gedhe Couture`,
      );

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const payload = (await res.json()) as { id?: string; url?: string; error?: unknown };
      if (!res.ok || !payload.url) {
        console.error("Stripe retry session failed", payload.error ?? payload);
        throw new Error("Stripe payment could not be restarted. Please try again.");
      }
      checkoutUrl = payload.url;
      providerReference = payload.id ?? null;
    } else {
      const secret = process.env["PAYSTACK_SECRET_KEY"];
      if (!secret) throw new Error("Paystack payment is not configured yet.");
      if (!order.customer_email) throw new Error("This order has no payment email address.");

      const paystackReference = paystackAttemptReference(order.reference, nextAttempt);
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: order.customer_email,
          amount: Math.round(Number(order.total) * 100),
          currency: "NGN",
          reference: paystackReference,
          callback_url: `${originFrom()}/order/${data.token}`,
          metadata: { reference: order.reference, order_reference: order.reference },
        }),
      });
      const payload = (await res.json()) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; reference?: string };
      };
      if (!res.ok || !payload.status || !payload.data?.authorization_url) {
        console.error("Paystack retry initialization failed", payload.message ?? payload);
        throw new Error("Paystack payment could not be restarted. Please try again.");
      }
      checkoutUrl = payload.data.authorization_url;
      providerReference = payload.data.reference ?? paystackReference;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        provider_reference: providerReference,
        provider_checkout_url: checkoutUrl,
        payment_attempts: nextAttempt,
        payment_status: "pending",
        last_payment_error: null,
      })
      .eq("id", order.id);
    if (updateError) {
      console.error("Payment retry order update failed", updateError);
      throw new Error(
        "Payment was started but the order could not be updated. Contact the atelier.",
      );
    }

    return { checkoutUrl };
  });
