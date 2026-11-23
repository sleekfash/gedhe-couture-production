/** Preview deployments must not write into the production database. */
export function assertWritableEnvironment() {
  if (process.env["VERCEL_ENV"] !== "preview") return;
  const database = process.env["SUPABASE_URL"] ?? "";
  const isolated =
    database &&
    !database.includes("zjllxxlfsernfyvoolhs") &&
    process.env["ENABLE_PREVIEW_WRITES"] === "true";
  if (!isolated)
    throw new Error(
      "This preview is read-only. Use the live storefront, or configure an isolated staging project before testing checkout.",
    );
  const stripe = process.env["STRIPE_SECRET_KEY"];
  const paystack = process.env["PAYSTACK_SECRET_KEY"];
  if (stripe?.startsWith("sk_live_") || paystack?.startsWith("sk_live_"))
    throw new Error("Staging must use test payment credentials.");
}
