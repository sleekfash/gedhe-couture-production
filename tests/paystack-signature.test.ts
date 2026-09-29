import assert from "node:assert/strict";
import test from "node:test";

import { validatePaystackCharge } from "../src/lib/paystack-payment.ts";
import { paystackSignatureHex, verifyPaystackSignature } from "../src/lib/paystack-signature.ts";

const secret = "sk_test_paystack_webhook_secret";
const body = JSON.stringify({ event: "charge.success", data: { id: 42, amount: 125000 } });

test("accepts a valid Paystack raw-body signature", async () => {
  const signature = await paystackSignatureHex(secret, body);
  assert.equal(await verifyPaystackSignature(signature, body, secret), true);
});

test("rejects a signature when the Paystack body is tampered with", async () => {
  const signature = await paystackSignatureHex(secret, body);
  assert.equal(await verifyPaystackSignature(signature, `${body} `, secret), false);
});

test("rejects malformed Paystack signatures", async () => {
  assert.equal(await verifyPaystackSignature("not-a-signature", body, secret), false);
});

test("accepts only a successful Paystack charge with the exact server total", () => {
  assert.equal(
    validatePaystackCharge({ status: "success", amount: 125000, currency: "NGN" }, 125000, "NGN"),
    null,
  );
});

test("rejects Paystack amount and currency mismatches", () => {
  assert.equal(
    validatePaystackCharge({ status: "success", amount: 124999, currency: "NGN" }, 125000, "NGN"),
    "amount_or_currency_mismatch",
  );
  assert.equal(
    validatePaystackCharge({ status: "success", amount: 125000, currency: "GBP" }, 125000, "NGN"),
    "amount_or_currency_mismatch",
  );
});

test("rejects a Paystack charge that is not successful", () => {
  assert.equal(
    validatePaystackCharge({ status: "failed", amount: 125000, currency: "NGN" }, 125000, "NGN"),
    "transaction_not_successful",
  );
});
