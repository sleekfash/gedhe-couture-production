import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { PRODUCT_COLUMNS } from "@/lib/product-mapper";

import {
  moneySchema,
  volumeTiersSchema,
  gallerySchema,
  imageSourceSchema,
} from "@/lib/product-validation";

const fulfilmentStatuses = [
  "new",
  "confirmed",
  "packed",
  "dispatched",
  "delivered",
  "cancelled",
] as const;

const productFields = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  category: z.enum(["Fabrics", "Ready-to-Wear", "Asoebi"]),
  variant: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  pattern: z.string().trim().max(160),
  option_label: z.string().trim().max(80),
  options: z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(40)
    .refine((v) => new Set(v).size === v.length, "Options must be unique."),
  min_qty: z.number().int().min(1).max(5000),
  price_ngn: moneySchema,
  price_gbp: moneySchema,
  volume_tiers: volumeTiersSchema,
  stock_status: z.enum(["In Stock", "Limited Stock", "Inquire for Timeline"]),
  image_url: imageSourceSchema,
  gallery: gallerySchema,
  published: z.boolean(),
  sort_order: z.number().int().min(0).max(100000),
});

const productInput = productFields.extend({ id: z.string().uuid() });

async function requireAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) throw new Error("Forbidden");
}

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(0).default(0),
        query: z.string().trim().max(100).default(""),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = context.supabase
      .from("orders")
      .select(
        "id,reference,customer_name,currency,total,payment_provider,payment_status,fulfilment_status,last_payment_error,payment_attempts,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id");
    if (data.query) {
      const value = data.query.replace(/[^a-zA-Z0-9 -]/g, "");
      if (value) query = query.or(`reference.ilike.%${value}%,customer_name.ilike.%${value}%`);
    }
    if (data.from) query = query.gte("created_at", `${data.from}T00:00:00+01:00`);
    if (data.to) query = query.lte("created_at", `${data.to}T23:59:59.999+01:00`);
    const [orders, events, stats, exceptions] = await Promise.all([
      query.range(data.page * 50, data.page * 50 + 49),
      context.supabase
        .from("payment_events")
        .select(
          "provider,event_id,event_type,order_reference,received_at,processed_at,failure_reason",
        )
        .not("failure_reason", "is", null)
        .order("received_at", { ascending: false })
        .limit(50),
      supabaseAdmin.rpc("admin_order_metrics", { p_actor: context.userId }),
      context.supabase
        .from("orders")
        .select(
          "id,reference,customer_name,currency,total,payment_provider,payment_status,fulfilment_status,last_payment_error,payment_attempts,created_at",
        )
        .or("last_payment_error.not.is.null,payment_status.eq.failed")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (orders.error || events.error || stats.error || exceptions.error)
      throw new Error("Could not load operations. Please retry.");
    return {
      orders: orders.data ?? [],
      totalMatching: orders.count ?? 0,
      page: data.page,
      exceptions: exceptions.data ?? [],
      failedEvents: events.data ?? [],
      metrics: stats.data as unknown as {
        total: number;
        newOrders: number;
        unpaid: number;
        backlog: number;
        exceptions: number;
        paidNgn: number;
        paidGbp: number;
      },
    };
  });

export const getAdminOrder = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: order, error: orderError } = await context.supabase
      .from("orders")
      .select("*")
      .eq("id", data.id)
      .single();
    if (orderError || !order) throw new Error("Order not found.");
    const [events, audit] = await Promise.all([
      context.supabase
        .from("payment_events")
        .select(
          "provider,event_id,event_type,order_reference,received_at,processed_at,failure_reason",
        )
        .eq("order_reference", order.reference)
        .order("received_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("order_audit_events")
        .select("event_type,from_value,to_value,note,actor_user_id,created_at")
        .eq("order_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (events.error || audit.error) throw new Error("Could not load order activity.");
    return { order, events: events.data ?? [], audit: audit.data ?? [] };
  });

export const updateAdminOrder = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fulfilment_status: z.enum(fulfilmentStatuses).optional(),
        admin_notes: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    // Browser roles cannot write orders or audit events. Keep the service key
    // server-only and derive the actor from verified authentication, never input.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("update_admin_order", {
      p_order_id: data.id,
      p_actor_user_id: context.userId,
      p_fulfilment_status: data.fulfilment_status ?? null,
      p_admin_notes: data.admin_notes ?? null,
    });
    if (error) {
      if (error.code === "42501") throw new Error("Forbidden");
      if (error.code === "P0002") throw new Error("Order not found.");
      if (error.code === "22023") throw new Error(error.message);
      // Keep database internals out of the browser while retaining a diagnostic
      // code in server logs. The RPC rolls back the update if auditing fails.
      console.error("Admin order update failed", { code: error.code });
      throw new Error("Could not update the order. Please retry or contact support.");
    }
    return { ok: true };
  });

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .order("sort_order", { ascending: true });
    if (error) throw new Error("Could not load products.");
    return data ?? [];
  });

export const updateAdminProduct = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => productInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    const { id, ...changes } = data;
    // zod has already validated the shape; the DB column type is JSON, so the
    // gallery/volume_tiers arrays are compatible at runtime.
    const update =
      changes as unknown as import("@/integrations/supabase/types").Database["public"]["Tables"]["products"]["Update"];
    const { error } = await context.supabase.from("products").update(update).eq("id", id);
    if (error) throw new Error("Could not save the product.");
    return { ok: true };
  });

export const createAdminProduct = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => productFields.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    const insert =
      data as unknown as import("@/integrations/supabase/types").Database["public"]["Tables"]["products"]["Insert"];
    const { data: product, error } = await context.supabase
      .from("products")
      .insert(insert)
      .select(PRODUCT_COLUMNS)
      .single();
    if (error || !product) {
      if (error?.code === "23505") throw new Error("That product code is already in use.");
      throw new Error("Could not create the product.");
    }
    return product;
  });

export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reference: z.string().trim().min(4).max(160),
        verified: z.literal(true),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("record_manual_payment", {
      p_order_id: data.id,
      p_actor: context.userId,
      p_reference: data.reference,
    });
    if (error)
      throw new Error(error.code === "22023" ? error.message : "Could not record payment.");
    return { ok: true };
  });
export const listProductInventory = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("product_inventory")
      .select("product_id,option,quantity,updated_at")
      .eq("product_id", data.id);
    if (error) throw new Error("Could not load stock.");
    return rows ?? [];
  });
export const setProductInventory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        option: z.string().min(1),
        quantity: z.number().int().min(0).max(100000),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_product_inventory", {
      p_actor: context.userId,
      p_product_id: data.id,
      p_option: data.option,
      p_quantity: data.quantity,
    });
    if (error) throw new Error(error.code === "22023" ? error.message : "Could not save stock.");
    return { ok: true };
  });
export const createProductImageUpload = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${crypto.randomUUID()}.webp`;
    const { data, error } = await supabaseAdmin.storage
      .from("product-images")
      .createSignedUploadUrl(path);
    if (error || !data) throw new Error("Could not start image upload.");
    return {
      path,
      token: data.token,
      url: supabaseAdmin.storage.from("product-images").getPublicUrl(path).data.publicUrl,
    };
  });
export const reconcileOrderPayment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { assertWritableEnvironment } = await import("@/lib/deployment-guard.server");
    assertWritableEnvironment();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,reference,payment_provider,provider_reference")
      .eq("id", data.id)
      .single();
    if (error || !order) throw new Error("Order not found.");
    const { data: attempts, error: attemptError } = await supabaseAdmin
      .from("payment_attempts")
      .select("provider_reference")
      .eq("order_id", order.id)
      .order("attempt", { ascending: false });
    if (attemptError) throw new Error("Could not load payment attempts.");
    const refs = [
      ...new Set(
        [...(attempts ?? []).map((x) => x.provider_reference), order.provider_reference].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ];
    if (!refs.length || order.payment_provider === "whatsapp")
      throw new Error("No card attempt to reconcile.");
    const { normalizeStripeEvent, normalizePaystackEvent } = await import("@/lib/payment-event");
    const { applyPaymentEvent } = await import("@/lib/payment-event.server");
    for (const ref of refs) {
      const stripe = order.payment_provider === "stripe";
      const secret = process.env[stripe ? "STRIPE_SECRET_KEY" : "PAYSTACK_SECRET_KEY"];
      if (!secret) throw new Error("Payment provider is not configured.");
      const response = await fetch(
        stripe
          ? `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(ref)}`
          : `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
        { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw new Error("Provider verification unavailable. Please retry.");
      const payload = await response.json();
      const event = stripe
        ? normalizeStripeEvent({
            id: `reconcile:${ref}:${payload.payment_status}:${payload.status}`,
            type:
              payload.status === "expired"
                ? "checkout.session.expired"
                : "checkout.session.completed",
            data: { object: payload },
          })
        : normalizePaystackEvent({
            event: payload.data?.status === "success" ? "charge.success" : "verification.pending",
            data: payload.data,
          });
      await applyPaymentEvent(event);
    }
    return { ok: true };
  });
