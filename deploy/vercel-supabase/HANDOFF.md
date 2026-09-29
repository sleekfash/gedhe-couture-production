# Gedhe Couture — Vercel and Supabase handoff

Production domain: `https://gedhecouture.com`

## Deployment target

- Runtime: Vercel Node.js serverless output (currently generated as Node.js 24)
- Build command: `npm run build:vercel`
- Framework preset: Other
- Output: Nitro Build Output API in `.vercel/output`

The repository's `vercel.json` selects the dedicated Vercel build. The default
build remains available for the ChatGPT Sites deployment, and `build:cpanel`
remains available for the Namecheap fallback.

## Vercel environment variables

Create every variable listed in `environment.example` for Production and
Preview. Store values in Vercel project settings; never commit populated
secrets. `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `PAYSTACK_SECRET_KEY`, and `CRON_SECRET` are
server-only.

## Connected-service configuration

In Supabase Auth URL Configuration, set the production Site URL to
`https://gedhecouture.com` and allow `https://gedhecouture.com/**`. Keep the
current ChatGPT Sites URL during the transition.

Configure payment webhooks after the Vercel production URL is working:

- Stripe: `https://gedhecouture.com/api/public/stripe-webhook`
- Paystack: `https://gedhecouture.com/api/public/paystack-webhook`

Use test credentials for acceptance testing, then replace only with live
credentials after the full checkout and order-processing flow passes.

## Acceptance test

1. Confirm the home page, hero image, catalogue, and direct product URLs load.
2. Sign in to admin and create a clearly labelled test product.
3. Add the product to the cart and complete a test payment.
4. Confirm the order appears in admin, then process it through Delivered.
5. Remove or unpublish the test product.

Do not treat a successful build as proof that Supabase or payment processing is
configured. Those integrations require the project environment variables and
provider-side webhook settings above.
