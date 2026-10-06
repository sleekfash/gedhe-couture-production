import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Execute real migrations/functions in PostgreSQL, with Supabase's auth roles stubbed.
test("checkout, payment and inventory transactions survive retries and failures", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
    for (const file of [
      "20260930093000_production_baseline.sql",
      "20261004221500_atomic_admin_order_update.sql",
      "20261006190000_checkout_payment_reliability.sql",
    ]) {
      const sql = await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      );
      await db.exec(sql.replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
    }
    const admin = "00000000-0000-4000-8000-000000000001";
    await db.query("INSERT INTO auth.users VALUES($1)", [admin]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')", [admin]);
    const p = (
      await db.query<{ id: string }>("SELECT id FROM public.products WHERE code='ANK-001'")
    ).rows[0]!.id;
    await db.query(
      'UPDATE products SET min_qty=2,volume_tiers=\'[{"minQty":4,"unitPriceNgn":2000,"unitPriceGbp":5},{"minQty":2,"unitPriceNgn":2500,"unitPriceGbp":6}]\' WHERE id=$1',
      [p],
    );
    await db.exec("SET ROLE service_role");
    await db.query("SELECT set_product_inventory($1,$2,$3,$4)", [admin, p, "Ochre Bloom", 6]);
    type Order = {
      id: string;
      reference: string;
      total: number;
      items: { qty: number; unitPrice: number }[];
    };
    let n = 0;
    async function create(
      provider = "paystack",
      qty = 2,
      option = "Ochre Bloom",
      requestId = crypto.randomUUID(),
      hash = "same",
    ) {
      const token = `token-${++n}`;
      const reference = `QA-${n}`;
      const args = [
        requestId,
        hash,
        token,
        reference,
        provider === "stripe" ? "GBP" : "NGN",
        provider,
        JSON.stringify({
          name: "QA Only",
          phone: "0000000000",
          email: "qa@example.com",
          city: "QA",
          address: "QA test address",
        }),
        JSON.stringify([{ productId: p, option, qty }]),
      ];
      const result = await db.query<{ create_checkout_order: Order }>(
        "SELECT create_checkout_order($1,$2,$3,$4,$5,$6,$7,$8)",
        args,
      );
      return { order: result.rows[0]!.create_checkout_order, token, args };
    }
    await assert.rejects(create("paystack", 1), /minimum/);
    await assert.rejects(create("paystack", 2, "Invented option"), /available product option/);
    const first = await create("paystack", 4);
    assert.equal(
      first.order.items[0]!.unitPrice,
      2000,
      "unsorted tiers use highest eligible threshold",
    );
    assert.equal(first.order.total, 11500);
    const replay = (
      await db.query<{ create_checkout_order: Order }>(
        "SELECT create_checkout_order($1,$2,$3,$4,$5,$6,$7,$8)",
        first.args,
      )
    ).rows[0]!.create_checkout_order;
    assert.equal(replay.id, first.order.id, "same request creates exactly one durable order");
    await assert.rejects(
      db.query(
        "SELECT create_checkout_order($1,$2,$3,$4,$5,$6,$7,$8)",
        first.args.map((v, i) => (i === 1 ? "changed" : v)),
      ),
      /details changed/,
    );
    await assert.rejects(create("paystack", 4), /Not enough stock/);
    await assert.rejects(
      db.query("SELECT set_product_inventory($1,$2,$3,$4)", [admin, p, "Ochre Bloom", 3]),
      /active reservations/,
    );
    const begin = (
      await db.query<{
        begin_payment_attempt: { attempt: { id: string; provider_reference: string } };
      }>("SELECT begin_payment_attempt($1)", [first.token])
    ).rows[0]!.begin_payment_attempt;
    const again = (
      await db.query<{ begin_payment_attempt: { attempt: { id: string } } }>(
        "SELECT begin_payment_attempt($1)",
        [first.token],
      )
    ).rows[0]!.begin_payment_attempt;
    assert.equal(
      begin.attempt.id,
      again.attempt.id,
      "payment initialization retries reuse one attempt",
    );
    const event = [
      "paystack",
      "event-paid",
      "charge.success",
      first.order.reference,
      begin.attempt.provider_reference,
      "paid",
      1150000,
      "NGN",
      null,
    ];
    // If audit persistence fails, neither the order nor the idempotency event may commit.
    await db.exec(
      "RESET ROLE; REVOKE INSERT ON order_audit_events FROM service_role; SET ROLE service_role",
    );
    await assert.rejects(
      db.query("SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)", event),
      /permission denied/,
    );
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [first.order.id],
        )
      ).rows[0]!.payment_status,
      "pending",
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM payment_events WHERE event_id=$1",
          ["event-paid"],
        )
      ).rows[0]!.count,
      0,
    );
    await db.exec(
      "RESET ROLE; GRANT INSERT ON order_audit_events TO service_role; SET ROLE service_role",
    );
    await db.query("SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)", event);
    await db.query("SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)", event);
    assert.equal(
      (
        await db.query<{ quantity: number }>(
          "SELECT quantity FROM product_inventory WHERE product_id=$1",
          [p],
        )
      ).rows[0]!.quantity,
      2,
      "duplicate callback consumes stock once",
    );
    await db.query("SELECT complete_payment_attempt($1,$2,$3)", [
      begin.attempt.id,
      begin.attempt.provider_reference,
      "https://checkout.paystack.com/qa",
    ]);
    await db.query(
      "SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      event.map((v, i) => (i === 1 ? "event-expired" : i === 5 ? "expired" : v)),
    );
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [first.order.id],
        )
      ).rows[0]!.payment_status,
      "paid",
      "late initialization/failure cannot downgrade paid",
    );
    await assert.rejects(
      db.query("SELECT begin_payment_attempt($1)", [first.token]),
      /cannot accept another/,
    );
    const stripe = await create("stripe", 2);
    const sa = (
      await db.query<{ begin_payment_attempt: { attempt: { id: string } } }>(
        "SELECT begin_payment_attempt($1)",
        [stripe.token],
      )
    ).rows[0]!.begin_payment_attempt.attempt;
    await db.query("SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      "stripe",
      "evt-pending",
      "checkout.session.completed",
      stripe.order.reference,
      "cs_qa",
      "pending",
      3000,
      "GBP",
      sa.id,
    ]);
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [stripe.order.id],
        )
      ).rows[0]!.payment_status,
      "pending",
      "completed unpaid Stripe session does not mark paid",
    );
    await db.query("SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      "stripe",
      "evt-bad-total",
      "checkout.session.completed",
      stripe.order.reference,
      "cs_qa",
      "paid",
      1,
      "GBP",
      sa.id,
    ]);
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [stripe.order.id],
        )
      ).rows[0]!.payment_status,
      "pending",
    );
    await db.query("SELECT apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      "stripe",
      "evt-paid",
      "checkout.session.async_payment_succeeded",
      stripe.order.reference,
      "cs_qa",
      "paid",
      3000,
      "GBP",
      sa.id,
    ]);
    assert.equal(
      (
        await db.query<{ payment_status: string }>(
          "SELECT payment_status FROM orders WHERE id=$1",
          [stripe.order.id],
        )
      ).rows[0]!.payment_status,
      "paid",
    );
    await db.query("SELECT set_product_inventory($1,$2,$3,$4)", [admin, p, "Ochre Bloom", 2]);
    const late = await create("whatsapp", 2);
    await db.query(
      "UPDATE stock_reservations SET expires_at=now()-interval '1 minute' WHERE order_id=$1",
      [late.order.id],
    );
    const held = await create("whatsapp", 2);
    await assert.rejects(
      db.query("SELECT begin_payment_attempt($1)", [late.token]),
      /coordinated on WhatsApp/,
    );
    await db.query("SELECT record_manual_payment($1,$2,$3)", [
      late.order.id,
      admin,
      "QA-late-payment",
    ]);
    const lateState = (
      await db.query<{ payment_status: string; last_payment_error: string }>(
        "SELECT payment_status,last_payment_error FROM orders WHERE id=$1",
        [late.order.id],
      )
    ).rows[0]!;
    assert.equal(
      lateState.payment_status,
      "paid",
      "late verified funds remain paid even if stock is unavailable",
    );
    assert.equal(
      lateState.last_payment_error,
      "stock_requires_review",
      "stock already held by another customer is not stolen",
    );
    assert.equal(
      (
        await db.query<{ quantity: number }>(
          "SELECT quantity FROM product_inventory WHERE product_id=$1",
          [p],
        )
      ).rows[0]!.quantity,
      2,
    );
    await db.query("SELECT update_admin_order($1,$2,$3,$4)", [
      held.order.id,
      admin,
      "cancelled",
      "QA cancel hold",
    ]);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM stock_reservations WHERE order_id=$1",
          [held.order.id],
        )
      ).rows[0]!.status,
      "released",
    );
    // Existing products with no inventory row remain purchasable; no fictitious stock added.
    const manual = await create("whatsapp", 2, "Indigo Grid");
    await db.query("SELECT record_manual_payment($1,$2,$3)", [
      manual.order.id,
      admin,
      "QA-bank-reference",
    ]);
    await db.query("SELECT record_manual_payment($1,$2,$3)", [
      manual.order.id,
      admin,
      "QA-bank-reference",
    ]);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM order_audit_events WHERE order_id=$1 AND event_type='manual_payment_confirmed'",
          [manual.order.id],
        )
      ).rows[0]!.count,
      1,
    );
    await assert.rejects(
      db.query("SELECT record_manual_payment($1,$2,$3)", [
        manual.order.id,
        crypto.randomUUID(),
        "QA-bank-reference",
      ]),
      /Forbidden/,
    );
    // Security boundary: browsers cannot execute service-only payment operations.
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(
      db.query("SELECT begin_payment_attempt($1)", [manual.token]),
      /permission denied/,
    );
    await db.exec("RESET ROLE");
    // The previous admin regression suite also executes against this isolated database.
    await db.exec(
      await readFile(new URL("../supabase/tests/admin_order_update.sql", import.meta.url), "utf8"),
    );
  } finally {
    await db.close();
  }
});
