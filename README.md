# Gedhe Couture

Production storefront and operations dashboard for Gedhe Couture.

## Stack

- TanStack Start, React 19 and Vite
- Tailwind CSS
- Hosted backend for catalogue, orders and staff authentication
- Stripe hosted checkout for GBP payments
- Paystack hosted checkout for NGN payments
- Optional WhatsApp order routing

## Local development

1. Copy `.env.example` to `.env` and provide the required values.
2. Install dependencies with `npm install`.
3. Start the application with `npm run dev`.

Useful checks:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run build:vercel
npm run build:cpanel
```

Use Node.js 22 for local development and deployment. GitHub Actions runs the
test, typecheck, lint, and Vercel build commands as independent checks so one
failure does not hide the result of the others.

Never commit `.env` or service-role/payment secrets.

## Deployment

The default build remains configured for the managed public preview. The
recommended production target is Vercel; see
`deploy/vercel-supabase/HANDOFF.md`. A separate Nitro Node build is available
for Namecheap shared hosting; see `deploy/namecheap/DEPLOYMENT.md`. Runtime
secrets belong in the selected hosting environment and must not be bundled into
a release archive.

GitHub Pages is not supported because checkout, staff access and payment
webhooks require the server runtime.

Read `AGENT_HANDOFF.md` before changing checkout, payment callbacks, order
lookups, or staff access.
