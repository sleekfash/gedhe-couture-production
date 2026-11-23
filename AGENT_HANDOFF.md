# Gedhe Couture — agent handoff

## Production and identity

- Canonical repository: `sleekfash/gedhe-couture-production`, main branch.
- Current public origin: https://gedhe-couture-production.vercel.app/
- Backend: Supabase project `zjllxxlfsernfyvoolhs`.
- Runtime: Node.js 22, TanStack Start/Nitro server on Vercel. This is not a static-only application.
- Do not mix this project with Wendy's Bakehouse or older Ankara repositories.
- Secrets must stay in server environment variables. Never request passwords or OTPs in chat.

## Release order

1. Create a release branch and pull request. Run independent Test, Typecheck, Lint and Vercel build checks.
2. Run `npm ci`, the same four commands and the database regression test locally on Node 22.
3. Apply migrations to staging first when a staging project is available. For this release, SQL is additive and tested in an isolated PostgreSQL engine, but production still requires live verification.
4. Apply `20261006190000_checkout_payment_reliability.sql` and `20261006200000_product_media.sql` before merging the application changes. The new application requires those RPCs and tables. Check existing migration history; earlier SQL Editor deployments may not be registered there.
5. Verify schema, RLS/privileges and existing catalogue reads. Merge only after migration succeeds and all four PR checks pass.
6. Verify the main commit's four CI jobs, Vercel deployment SHA, storefront refresh/cart/currency, admin access and QA-only checkout/save/reconciliation.
7. Use provider test mode for payment exercises. Never buy with live cards, dispatch QA orders, message customers, or change real customer orders during QA.

## Payment invariants

- Prices, quantity floors, product options and volume tiers are authoritative in PostgreSQL, not browser input.
- A durable order and idempotent request exist before external payment initialization.
- Event receipt, payment state, stock consumption and audit event are one transaction. A failed transaction returns retryable HTTP 503; it does not leave a consumed idempotency key.
- Stripe completion alone is not proof of payment; `payment_status=paid`, exact currency/amount, order binding and known attempt are required.
- Early Stripe callbacks may bind the initializing attempt using the signed session's `metadata.attempt_id`. Provider reference uniqueness still applies.
- Late failures and initialization must not downgrade paid/refunded orders. An extra payment or payment after cancellation/refund is an exception requiring staff review.
- One active payment attempt is reused; maximum five attempts. Failed/expired sessions may start another attempt. Initialization uncertainty must not blindly create a second session.
- Stripe requests use the attempt ID as idempotency key and a stable one-hour expiry. An unresolved initializing session after the creation window needs staff/provider recovery; do not bypass it by deleting the attempt.
- Paystack uses a stable per-attempt reference. If the initialization response is lost, provider verification can reconcile received funds. A pending transaction without a recovered authorization URL requires provider/support recovery rather than another charge attempt.
- Refunds are provider operations; this release does not pretend to execute refunds or automatically settle chargebacks.

## Stock rules

- Existing options without inventory rows remain untracked. No invented stock quantities are added.
- Admin enters actual stock on hand, including reserved units. Checkout locks products and validates available stock after active reservations.
- WhatsApp holds last 24 hours; Stripe holds one hour; Paystack holds 30 minutes. Expired holds are ignored in availability. Payments received after a hold expires may require manual stock review.
- Stock is consumed once on verified payment OR an explicit staff confirmation; repeated callbacks/status saves do not consume twice.
- Cancellation releases an unconsumed hold. Cancellation after consumption does not automatically restock: inspect the garment/fabric, refund if appropriate and enter the real resulting stock quantity.
- Old orders created before this migration do not have reservations. Include their obligations when entering initial stock counts.
- A stock exception remains an operational blocker: arrange replacement/refund with the customer before dispatch; do not infer payment failure from a stock exception.

## Admin and customer changes

- Dashboard metrics cover all stored orders. Search/date filters use server pagination, 50 orders per page; dates use Lagos boundaries.
- Payment exception lists are explicitly limited to the latest 50 records. Order activity/events are scoped to the selected order, latest 100 each.
- Manual WhatsApp/bank payments require the admin to verify the bank receipt/full funds before recording a reference; this creates an audit record, not a bank transaction.
- Product gallery and tier editing use labelled fields and strict validation. Product image uploads resize to WebP, at most 1600px and 2MB; the merchandise-only public storage bucket does not accept receipts/customer documents.
- Order/admin/auth pages are noindex with no-referrer. Robots exclusions are indexing guidance, not access control. Supabase auth/RLS protect access.
- Checkout request persistence contains hashes/opaque IDs, not customer PII. The paid status page clears a matching submitted bag only; an altered bag is preserved.

## Environment and operations pending outside code

- Production `PUBLIC_SITE_URL` may be set to the Vercel origin; leave blank locally. Do not point a staging build at production. Update canonical product URLs/robots sitemap origin when a purchased domain is connected.
- Separate staging Supabase and test payment credentials are required before enabling real preview checkouts; Vercel preview environments must not share production service/payment secrets. The application blocks preview writes by default; `ENABLE_PREVIEW_WRITES=true` requires a different Supabase project URL and rejects live payment keys.
- Configure authenticated SMTP and tested recovery-email delivery; owning a domain does not itself create a mailbox.
- Enable MFA for GitHub/Vercel/Supabase and establish backup + restore testing. Paid plans/billing require the owner's selection and payment.
- Protect main with all four required checks. Vercel's successful build does not prove tests, typecheck or lint passed; auto-deployment is not inherently gated by GitHub CI.
- Confirm delivery zones/fees, garment sizing/measurements, return/refund terms, event deadlines and customer notification consent. Do not invent these policies or silently apply a flat delivery fee to unsupported destinations.
- Add verified reviews/wishlist/restock subscriptions only after base operations are proven. Do not publish fake reviews, email marketing or unsolicited WhatsApp notifications.

## Validation evidence

`tests/checkout-database.test.ts` runs the real SQL migrations/functions in PGlite PostgreSQL with Supabase role/auth fixtures. It checks durable request replay, authoritative unsorted-tier pricing, stock holds, invalid options/minimum quantities, audit-failure rollback/retry, duplicate callbacks, payment initialization races, unpaid Stripe completion, wrong totals, manual payment permissions and previous atomic admin-save regressions. It is not a substitute for network/provider concurrency or live staging tests.
