import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStripeEvent, normalizePaystackEvent } from "../src/lib/payment-event.ts";
import { volumeTiersSchema, gallerySchema } from "../src/lib/product-validation.ts";
test("Stripe completed is paid only when Stripe explicitly reports paid", () => {
  const event = {
    id: "evt",
    type: "checkout.session.completed",
    data: { object: { id: "cs", payment_status: "unpaid", metadata: { attempt_id: "attempt" } } },
  };
  assert.equal(normalizeStripeEvent(event).outcome, "pending");
  assert.equal(
    normalizeStripeEvent({
      ...event,
      data: { object: { ...event.data.object, payment_status: "paid" } },
    }).outcome,
    "paid",
  );
  assert.equal(normalizeStripeEvent(event).attemptId, "attempt");
  assert.equal(
    normalizeStripeEvent({ ...event, type: "payment_intent.payment_failed" }).outcome,
    "ignored",
  );
});
test("Paystack requires successful charge and resolves serialized metadata", () => {
  const event = {
    event: "charge.success",
    data: {
      id: 1,
      reference: "ORDER-P1",
      status: "success",
      metadata: '{"order_reference":"ORDER"}',
    },
  };
  assert.equal(normalizePaystackEvent(event).outcome, "paid");
  assert.equal(normalizePaystackEvent(event).reference, "ORDER");
  assert.equal(
    normalizePaystackEvent({ ...event, data: { ...event.data, status: "failed" } }).outcome,
    "ignored",
  );
});
test("product validation rejects invalid prices, duplicate tiers and unsafe images", () => {
  const tier = { minQty: 5, label: "Bulk", unitPriceNgn: 2000, unitPriceGbp: 5 };
  assert.equal(volumeTiersSchema.safeParse([tier, tier]).success, false);
  assert.equal(volumeTiersSchema.safeParse([{ ...tier, unitPriceNgn: 1.001 }]).success, false);
  assert.equal(volumeTiersSchema.safeParse([{ ...tier, unitPriceNgn: -1 }]).success, false);
  assert.equal(gallerySchema.safeParse([{ src: "https://", caption: "" }]).success, false);
  assert.equal(
    gallerySchema.safeParse([{ src: "javascript:alert(1)", caption: "" }]).success,
    false,
  );
  assert.equal(
    gallerySchema.safeParse([{ src: "asset:product-fabric.jpg", caption: "Detail" }]).success,
    true,
  );
});
