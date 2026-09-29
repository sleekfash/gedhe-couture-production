import assert from "node:assert/strict";
import test from "node:test";

import { stripeSignatureHex, verifyStripeSignature } from "../src/lib/stripe-signature.ts";

const secret = "whsec_test_secret";
const timestamp = 1_750_000_000;
const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });

test("accepts a valid Stripe signature", async () => {
  const signature = await stripeSignatureHex(secret, `${timestamp}.${body}`);
  assert.equal(
    await verifyStripeSignature(`t=${timestamp},v1=${signature}`, body, secret, timestamp),
    true,
  );
});

test("rejects a tampered payload", async () => {
  const signature = await stripeSignatureHex(secret, `${timestamp}.${body}`);
  assert.equal(
    await verifyStripeSignature(`t=${timestamp},v1=${signature}`, `${body}x`, secret, timestamp),
    false,
  );
});

test("rejects a stale signature", async () => {
  const signature = await stripeSignatureHex(secret, `${timestamp}.${body}`);
  assert.equal(
    await verifyStripeSignature(`t=${timestamp},v1=${signature}`, body, secret, timestamp + 301),
    false,
  );
});
