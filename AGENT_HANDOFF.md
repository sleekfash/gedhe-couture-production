# Gedhe Couture — takeover prompt for a Codex agent

You are taking over an in-flight build of **Gedhe Couture**, a production storefront. Read `AGENTS.md` and this document before touching code.

---

## 1. Stack rules (non-negotiable)

- TanStack Start v1 + React 19 + Vite 8, Tailwind v4 via `src/styles.css`. No React Router, no `src/pages`, no `App.tsx` page switcher. Never edit `src/routeTree.gen.ts` (generated).
- Backend access is isolated behind `@/integrations/supabase/client`. Treat generated database types as read-only and keep secrets out of committed files.
- App-internal server logic uses `createServerFn` from `@tanstack/react-start`, in `*.functions.ts` under `src/lib/`. Server-only helpers live in `*.server.ts`. Never place client-imported server functions under `src/server/`.
- External callers (webhooks, cron) use file routes under `src/routes/api/public/*`, with handlers shaped as `server.handlers.<METHOD>` — not exported `GET`/`POST` functions. Authenticate the caller inside the handler.
- Read `process.env` only inside `.handler()`. Browser config uses `import.meta.env.VITE_*`.
- Application runtime code must remain portable across the default Cloudflare-style Worker build and the Namecheap Nitro Node build: no `child_process`, `sharp`, `puppeteer`, native addons. Build-only scripts may use Node APIs. Never set `ssr.external`/`resolve.external` in `vite.config.ts`.
- Every content route needs its own `head()` with a unique title, description, `og:title`, and `og:description`.
- Never statically import a browser-only library (maps, editors) from an SSR route; gate it behind `ClientOnly` + a dynamic import.

## 2. Security rules that already passed review — do not regress

- **Order lookup** is by a cryptographically random token only. Only the SHA-256 hash is stored (`orders.lookup_token_hash`), with `lookup_expires_at` (30 days) and `lookup_revoked_at`. The display reference (`3KB-XXXXXXXXXX`) is never a credential.
- **The public order DTO** returns only: display reference, item summary, totals, currency, payment state, fulfilment state, masked contact hint. It must never return phone, address, notes, or admin notes.
- **Writes to `orders` and `payment_events` are service-role only.** There is intentionally no customer INSERT policy. Two scanner findings asking for one were reviewed and closed as not applicable — do not "fix" them.
- **Roles live in `public.user_roles` only** (enum `app_role`: `admin`, `staff`), checked through the security-definer function `private.has_role(uuid, app_role)`. Never a profile column, never client storage, never a hardcoded credential.
- Every admin server function verifies the role server-side, in addition to the route guard. Route visibility is not authorization.
- Every new `public` table, in this exact order: `CREATE TABLE` → `GRANT`s → `ENABLE ROW LEVEL SECURITY` → policies. A migration without GRANTs is broken at runtime.
- Never call a `requireSupabaseAuth`-protected server function from a public route loader — prerender has no session. Protected loaders belong under `_authenticated`.
- Never expose Supabase project IDs, URLs, or dashboard links to the owner. Call it "the backend".

## 3. Payments — the current contract

- **Stripe and Paystack are implemented.** GBP orders use Stripe hosted checkout; NGN orders use Paystack hosted checkout. WhatsApp remains an optional non-gateway route.
- The webhook is `src/routes/api/public/stripe-webhook.ts`. The order of operations is load-bearing:
  1. Read the **raw** body; verify `Stripe-Signature` as HMAC-SHA-256 of `` `${timestamp}.${rawBody}` `` against `STRIPE_WEBHOOK_SECRET`, 300s clock tolerance, timing-safe compare. Return 401 on failure, **before** any parsing.
  2. Insert into `payment_events` first. A unique violation on `(provider, event_id)` (Postgres `23505`) means duplicate → return 200 and stop. That is the idempotency mechanism.
  3. Match the order via `client_reference_id ?? metadata.reference`.
  4. Compare the minor-unit amount and currency against the server-calculated `orders.total`. Mismatch → set `last_payment_error = 'amount_or_currency_mismatch'`, log a `payment_exception` row in `order_audit_events`, and do **not** mark paid.
  5. Only then set `payment_status`, `provider_reference`, `paid_at`.
- PAID events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`. FAILED events: `checkout.session.expired`, `checkout.session.async_payment_failed`, `payment_intent.payment_failed`.
- Return provider-compatible 200s for handled-but-ignored events; keep detail in server logs, never in customer-facing text.
- `retryOrderPayment` reuses the same order and reference, increments `payment_attempts`, caps at 5. Never create a duplicate order.
- Paystack callbacks use `src/routes/api/public/paystack-webhook.ts`: verify the raw body with HMAC-SHA-512 from `x-paystack-signature`, insert the event first, resolve the order from metadata, require `charge.success` plus `data.status === 'success'`, then enforce the same server-calculated minor-unit and currency gate as Stripe.
- Verified DB constraints: `payment_status` ∈ pending/paid/failed/cancelled/refunded; `fulfilment_status` ∈ new/confirmed/packed/dispatched/delivered/cancelled; `payment_provider` ∈ stripe/paystack/whatsapp.

## 4. Brand and UI/UX standard — this is the bar, hold it

- **Gedhe Couture** is the parent brand: "a fashion company creating and curating stylish pieces for the modern woman." Three verticals under one line, "Three verticals, one standard of finish":
  - **The Edit Co. RTW.** — @theeditco.rtw — Ankara fabrics and ready-to-wear
  - **The Edit Co.** — @theeditco.ng — curated thrift and vintage
  - **Affordable Asoebi Bulk Supply** — no Instagram account
- WhatsApp everywhere: **+234 803 222 7986**. All brand constants live in `src/data/catalog.ts` (`BRAND`, `VERTICALS`, `CATEGORIES`) — never hardcode them in components.
- Visual language: editorial, high-contrast, serif headings over clean sans body; deep charcoal / soft linen with burnished gold and clay terracotta accents. Edge-to-edge product imagery, restrained motion.
- **All colours, gradients, and shadows are semantic tokens in `src/styles.css`**, consumed through shadcn variants. Never `text-white`, `bg-black`, or `bg-[#hex]` in a component — it breaks theming.
- Reject generic AI aesthetics: no default Inter/Poppins look, no purple-indigo-on-white gradients, no interchangeable hero/nav/footer.
- Mobile-first: Instagram is the traffic source. Verify every screen at a phone width.
- Every route ships real loading, empty, error, and not-found states. A bare spinner is not a design.
- Product images stored as `asset:<file>` must render through `resolveImage()` from `@/data/catalog` — including in admin screens.

## 5. Working practice expected of you

- Batch independent reads and edits as parallel calls. Don't end a turn on a single small write.
- After edits, read the newest entry in `/tmp/observability/build-errors.log` in a **later** message. Never claim completion while it shows errors — including ones that predate your change.
- Verify UI claims with Playwright against `http://localhost:8080`. **Never restart the dev server** (it is supervised). Viewport `1280x1800`, never `full_page=True`. Keep scripts under `/tmp/browser/<slug>/`.
- Never run stateful git commands. Use `bun` for JS/TS, `tsgo` for type-only checks, `rg` for search.
- Keep `js-yaml` **transitive** (the lockfile resolves 4.3.2). `bun.lock` is the text lockfile and must stay text — the dependency scanner cannot read `bun.lockb`.
- Talk to the owner in plain, non-technical language. Avoid "Supabase", "RLS", "component", "route", "build". One or two sentences, leading with what they can now do.
- Never invent business content (prices, hours, phone numbers). Ask for the real thing.
- Do not re-propose rejected ideas: no profile table and no customer-side insert policies.

## 6. State at handoff

- Storefront, verticals section, cart panel, order-return page, token order page, admin dashboard (orders / payment exceptions / products editor), and admin sign-in are implemented and building clean.
- A real Stripe test-card order was verified end to end: hosted checkout → signed webhook → order flipped to `paid`. A tampered signature was rejected with 401, a replayed event was idempotent, and a wrong-amount event refused to mark the order paid.
- An admin account exists (`admin@gedhecouture.com`) with an `admin` row in `user_roles`. No profile data, by design.
- Four temporary catalog products remain in the database, awaiting real inventory from the owner.

## 7. Open work — task list, in order

1. **Fix the type-check failure in `src/routes/api/public/stripe-webhook.ts`.** Two `TS7031` errors on the `request` binding. Root cause is a version mismatch: `@tanstack/react-router@1.170.36` vs `@tanstack/react-start@1.168.52`, where `start-client-core` bundles its own `router-core@1.171.29`, so route type augmentation never reaches the instance in use. Align the packages in one coordinated update, then re-run the type check and a full build. Do **not** paper over it with `any` or `@ts-ignore`. Runtime behaviour must stay identical — re-verify the webhook afterwards with a signed, a tampered, and a replayed event.
2. **Run the security scan** and report results. Fix only what is genuinely actionable; leave the two closed order/payment insert-policy findings closed.
3. **Collect real inventory from the owner** — per vertical: names, prices in NGN and GBP, options and option label, minimum quantity, Asoebi volume tiers, stock status, and photos. Then replace the four temporary products through the admin products editor path (the schema already supports all of it). Do not invent product data.
4. **Harden the fulfilment workflow**: enforce New → Confirmed → Packed → Dispatched → Delivered (+ Cancelled) server-side and reject invalid jumps; record every change in `order_audit_events` with the acting admin.
5. **Order export** for fulfilment and accounting, admin-authenticated only, PII limited to authenticated admins.
6. **Revenue reporting split by NGN and GBP** — never a blended total.
7. **Customer notification hooks** on payment confirmation and fulfilment milestones, designed so email or WhatsApp can be switched on later without exposing private data.
8. **Asoebi event-date and quantity capture** at checkout, with an urgency indicator in the dashboard for production timelines.
9. **Catalogue change history** for price and volume-tier edits, to prevent silent pricing disputes.
10. **Low-stock and "inquire for timeline" alerts** surfaced in the operations dashboard.
11. **Paystack completed on owner request:** preserve raw-body `x-paystack-signature` verification, event-first idempotency, and the amount/currency gate in all future payment changes.

## 8. Definition of done for every task

- Build log clean; type check clean.
- Behaviour verified in the running preview with Playwright, and the observation reported (final URL, page state, console errors).
- No hardcoded colours — tokens only. Mobile width checked.
- Every new table has GRANTs, RLS, and policies. Every new admin function verifies the role server-side.
- No PII added to any public response.
- Closing message to the owner: one or two plain sentences about what they can now do.

## 9. Useful references

- `src/data/catalog.ts` — brand, verticals, categories, currency helpers, `resolveImage`, `priceIn`, `buildSku`.
- `src/lib/checkout.functions.ts` — order creation, token issuance, `retryOrderPayment`.
- `src/lib/admin.functions.ts` — `getAdminDashboard` (orders, exceptions, failed events, metrics), `getAdminOrder`.
- `src/routes/admin/` — route guard plus the operations dashboard.
- `src/routes/order/$token.tsx`, `src/routes/order-return.tsx` — customer order status.
- `README.md` — local setup, checks and deployment notes.
