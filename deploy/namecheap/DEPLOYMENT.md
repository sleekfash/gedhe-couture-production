# Gedhe Couture — Namecheap shared-hosting deployment

Target production URL: `https://gedhecouture.com`

## 1. Create the Node.js application

In cPanel, open **Setup Node.js App** and select **Create application**.

| Field                    | Value                      |
| ------------------------ | -------------------------- |
| Node.js version          | 22.x                       |
| Application mode         | Production                 |
| Application root         | `gedhe-couture`            |
| Application URL          | `https://gedhecouture.com` |
| Application startup file | `app.js`                   |

The application root is relative to the cPanel account home directory. Do not
extract the package into `public_html`; Namecheap maps the selected URL to the
Node application.

## 2. Upload the release

Upload `gedhe-couture-namecheap.zip` with cPanel File Manager and extract its
contents directly into the application root. The resulting layout must be:

```text
gedhe-couture/
  .output/
  app.js
  package.json
  environment.example
  DEPLOYMENT.md
```

The `.output` directory is a prebuilt, standalone Nitro Node server. Source
files and build dependencies are deliberately excluded from the hosting
package.

## 3. Configure runtime variables

In the Node.js App dashboard, use **Add Variable** for every entry listed in
`environment.example`. Do not upload a populated `.env` file and do not place
secret values in File Manager, Git or `public_html`.

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required for the storefront.
`SUPABASE_SECRET_KEY` is required by the trusted payment webhooks and order writes; it must
never be exposed to the browser. The legacy variable name
`SUPABASE_SERVICE_ROLE_KEY` remains supported. `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, and `PAYSTACK_SECRET_KEY` are required for their
respective hosted payment routes.

## 4. Install and start

Namecheap expects a `package.json`, although this prebuilt package has no
runtime npm dependencies. Click **Run NPM Install**, then **Restart** the
application. If cPanel reports a stale Passenger process, stop and start the
application once.

## 5. Configure connected services

In Supabase Auth URL Configuration:

- Set the Site URL to `https://gedhecouture.com`.
- Add `https://gedhecouture.com/**` as an allowed redirect.
- Keep `https://gedhe-couture.ditech-solvia.chatgpt.site/**` during the
  transition so the existing deployment remains usable.

In Stripe, create or update the production webhook endpoint:

```text
https://gedhecouture.com/api/public/stripe-webhook
```

Subscribe it to the payment events used by the application and copy its signing
secret into `STRIPE_WEBHOOK_SECRET` in cPanel.

In Paystack, set the production webhook URL to:

```text
https://gedhecouture.com/api/public/paystack-webhook
```

Use the Paystack live secret key in `PAYSTACK_SECRET_KEY` only after the full
test-mode checkout and callback flow passes.

## 6. Acceptance checks

1. Open the homepage over HTTPS and confirm the hero and catalogue load.
2. Open a product URL directly in a new private window.
3. Complete password recovery and administrator sign-in.
4. Create a clearly labelled test product and publish it.
5. Add the product to the storefront cart and submit a WhatsApp test order.
6. Confirm the order appears in admin and process it to Delivered.
7. Test Stripe/Paystack only in their test modes before enabling live keys.
8. Unpublish the test product when validation is complete.

If the homepage returns a Passenger error, check the Node application log first
and confirm that the startup file is exactly `app.js`, Node is 22.x, and all
required environment variables are present.
