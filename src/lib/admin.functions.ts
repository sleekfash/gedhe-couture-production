import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { PRODUCT_COLUMNS } from "@/lib/product-mapper";

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
  category: z.string().trim().min(2).max(80),
  variant: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  pattern: z.string().trim().max(160),
  option_label: z.string().trim().max(80),
  options: z.array(z.string().trim().min(1).max(120)).max(40),
  min_qty: z.number().int().min(1).max(5000),
  price_ngn: z.number().min(0),
  price_gbp: z.number().min(0),
  volume_tiers: z.array(z.record(z.string(), z.unknown())).max(30),
  stock_status: z.string().trim().min(2).max(80),
  image_url: z.string().trim().max(1000),
  gallery: z.array(z.record(z.string(), z.unknown())).max(30),
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
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const [{ data: orders, error }, { data: failedEvents }] = await Promise.all([
      context.supabase
        .from("orders")
        .select(
          "id, reference, customer_name, currency, total, payment_provider, payment_status, fulfilment_status, last_payment_error, payment_attempts, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(250),
      context.supabase
        .from("payment_events")
        .select(
          "provider, event_id, event_type, order_reference, received_at, processed_at, failure_reason",
        )
        .not("failure_reason", "is", null)
        .order("received_at", { ascending: false })
        .limit(50),
    ]);

    if (error) throw new Error("Could not load orders.");
    const rows = orders ?? [];
    const paid = rows.filter((row: { payment_status: string }) => row.payment_status === "paid");
    const unpaid = rows.filter(
      (row: { payment_status: string }) => row.payment_status === "pending",
    );
    const backlog = rows.filter((row: { fulfilment_status: string }) =>
      ["new", "confirmed", "packed", "dispatched"].includes(row.fulfilment_status),
    );

    const exceptions = rows.filter(
      (row: { last_payment_error: string | null; payment_status: string }) =>
        Boolean(row.last_payment_error) || row.payment_status === "failed",
    );

    return {
      orders: rows,
      exceptions,
      failedEvents: failedEvents ?? [],
      metrics: {
        exceptions: exceptions.length,
        total: rows.length,
        newOrders: rows.filter(
          (row: { fulfilment_status: string }) => row.fulfilment_status === "new",
        ).length,
        unpaid: unpaid.length,
        backlog: backlog.length,
        paidNgn: paid
          .filter((row: { currency: string }) => row.currency === "NGN")
          .reduce((sum: number, row: { total: number }) => sum + Number(row.total), 0),
        paidGbp: paid
          .filter((row: { currency: string }) => row.currency === "GBP")
          .reduce((sum: number, row: { total: number }) => sum + Number(row.total), 0),
      },
    };
  });

export const getAdminOrder = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const [{ data: order, error: orderError }, { data: events }, { data: audit }] =
      await Promise.all([
        context.supabase.from("orders").select("*").eq("id", data.id).single(),
        context.supabase
          .from("payment_events")
          .select(
            "provider, event_id, event_type, order_reference, received_at, processed_at, failure_reason",
          )
          .order("received_at", { ascending: false }),
        context.supabase
          .from("order_audit_events")
          .select("event_type, from_value, to_value, note, actor_user_id, created_at")
          .eq("order_id", data.id)
          .order("created_at", { ascending: false }),
      ]);
    if (orderError || !order) throw new Error("Order not found.");
    return {
      order,
      events: (events ?? []).filter(
        (event: { order_reference: string | null }) => event.order_reference === order.reference,
      ),
      audit: audit ?? [],
    };
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
