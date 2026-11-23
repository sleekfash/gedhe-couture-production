import assert from "node:assert/strict";
import test from "node:test";
import { assertWritableEnvironment } from "../src/lib/deployment-guard.server.ts";
test("preview deployments cannot write production data or use live payment keys", () => {
  const keys = [
    "VERCEL_ENV",
    "SUPABASE_URL",
    "ENABLE_PREVIEW_WRITES",
    "STRIPE_SECRET_KEY",
    "PAYSTACK_SECRET_KEY",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env["VERCEL_ENV"] = "preview";
    process.env["SUPABASE_URL"] = "https://zjllxxlfsernfyvoolhs.supabase.co";
    process.env["ENABLE_PREVIEW_WRITES"] = "true";
    assert.throws(assertWritableEnvironment, /read-only/);
    process.env["SUPABASE_URL"] = "https://staging.supabase.co";
    process.env["STRIPE_SECRET_KEY"] = "sk_live_example";
    assert.throws(assertWritableEnvironment, /test payment/);
    process.env["STRIPE_SECRET_KEY"] = "sk_test_example";
    process.env["PAYSTACK_SECRET_KEY"] = "sk_test_example";
    assert.doesNotThrow(assertWritableEnvironment);
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
