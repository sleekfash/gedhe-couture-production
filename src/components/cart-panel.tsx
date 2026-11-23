/**
 * Frictionless transactional panel — slide-out, continuous 3-step flow:
 * 1. Product Overview  2. Order Routing  3. Payment (Stripe / Paystack / WhatsApp)
 * Totals shown here are recomputed server-side before any payment is created.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Globe2,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BRAND, DELIVERY_FEE, formatMoney, resolveImage, type Currency } from "@/data/catalog";
import { startCheckout, type CheckoutResult } from "@/lib/checkout.functions";
import { useStore } from "@/lib/store";

const STEPS = ["Overview", "Routing", "Payment"] as const;

type Provider = "stripe" | "paystack" | "whatsapp";

interface Routing {
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  notes: string;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  paystack: "Card & transfer — Paystack (NGN)",
  stripe: "Card — Stripe (GBP)",
  whatsapp: "WhatsApp order routing",
};

function buildWhatsAppMessage(order: CheckoutResult, routing: Routing, provider: Provider) {
  const money = (n: number) => formatMoney(n, order.currency);
  return [
    `*New order — @${BRAND.handle}*`,
    `Ref: ${order.reference}`,
    "",
    "*Items*",
    ...order.items.map(
      (i) => `• ${i.qty} x ${i.name} (${i.option}) [${i.sku}] — ${money(i.lineTotal)}`,
    ),
    "",
    `Subtotal (${order.volume} items): ${money(order.subtotal)}`,
    `Dispatch: ${money(order.delivery)}`,
    `*Total: ${money(order.total)}*`,
    "",
    "*Customer*",
    `Name: ${routing.name}`,
    `WhatsApp: ${routing.phone}`,
    `Email: ${routing.email || "—"}`,
    `City/State: ${routing.city}`,
    `Address: ${routing.address}`,
    `Delivery notes: ${routing.notes.trim() || "—"}`,
    "",
    `Route: ${PROVIDER_LABEL[provider]}`,
  ].join("\n");
}

export function CartPanel() {
  const {
    cartOpen,
    closeCart,
    lines,
    volume,
    subtotal,
    updateQty,
    removeLine,
    clearCart,
    currency,
    setCurrency,
    money,
  } = useStore();
  const checkout = useServerFn(startCheckout);
  const pendingSubmission = useRef<{
    fingerprint: string;
    requestId: string;
    lookupToken: string;
  } | null>(null);

  const [step, setStep] = useState(0);
  const [payWithCard, setPayWithCard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [routing, setRouting] = useState<Routing>({
    name: "",
    phone: "",
    email: "",
    city: "",
    address: "",
    notes: "",
  });
  const [placed, setPlaced] = useState<CheckoutResult | null>(null);
  const [placedProvider, setPlacedProvider] = useState<Provider>("whatsapp");

  useEffect(() => {
    if (cartOpen) {
      setStep(0);
      setPlaced(null);
    }
  }, [cartOpen]);

  const cardProvider: Provider = currency === "NGN" ? "paystack" : "stripe";
  const provider: Provider = payWithCard ? cardProvider : "whatsapp";

  const routingComplete =
    routing.name.trim() !== "" &&
    routing.phone.trim().length >= 7 &&
    routing.city.trim() !== "" &&
    routing.address.trim() !== "" &&
    (provider === "whatsapp" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(routing.email.trim()));

  const delivery = lines.length ? DELIVERY_FEE[currency] : 0;
  const total = subtotal + delivery;

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const details = {
        currency,
        provider,
        customer: {
          name: routing.name.trim(),
          phone: routing.phone.trim(),
          email: routing.email.trim(),
          city: routing.city.trim(),
          address: routing.address.trim(),
          notes: routing.notes.trim(),
        },
        items: lines.map((l) => ({ productId: l.product.id, option: l.option, qty: l.qty })),
      };
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(details))),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      let submission =
        pendingSubmission.current?.fingerprint === fingerprint
          ? pendingSubmission.current
          : {
              fingerprint,
              requestId: crypto.randomUUID(),
              lookupToken: crypto.randomUUID(),
            };
      try {
        const prior = JSON.parse(localStorage.getItem("gedhe-checkout-request") ?? "null");
        if (
          prior?.fingerprint === fingerprint &&
          typeof prior.requestId === "string" &&
          typeof prior.lookupToken === "string"
        )
          submission = prior;
        localStorage.setItem("gedhe-checkout-request", JSON.stringify(submission));
      } catch {
        /* in-memory fallback */
      }
      pendingSubmission.current = submission;
      const result = await checkout({
        data: {
          requestId: submission.requestId,
          lookupToken: submission.lookupToken,
          currency,
          provider,
          customer: {
            name: routing.name.trim(),
            phone: routing.phone.trim(),
            email: routing.email.trim(),
            city: routing.city.trim(),
            address: routing.address.trim(),
            notes: routing.notes.trim(),
          },
          items: lines.map((l) => ({
            productId: l.product.id,
            option: l.option,
            qty: l.qty,
          })),
        },
      });

      if (result.checkoutUrl) {
        toast.success("Redirecting to secure payment", { description: `Ref ${result.reference}` });
        window.location.href = result.checkoutUrl;
        return;
      }

      setPlacedProvider(provider);
      setPlaced(result);
      clearCart();
      pendingSubmission.current = null;
      try {
        localStorage.removeItem("gedhe-checkout-request");
      } catch {
        /* storage unavailable */
      }
      toast.success("Order routed to the atelier", {
        description: "A stylist confirms your pack shortly.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed. Please try again.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full border border-input bg-background px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold";

  return (
    <>
      <div
        onClick={closeCart}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-charcoal-deep/60 backdrop-blur-sm transition-opacity duration-300 ${
          cartOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-label="Checkout panel"
        aria-hidden={!cartOpen}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-background shadow-[var(--shadow-panel)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          cartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-b border-border px-5 py-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            {step > 0 && !placed ? (
              <button
                type="button"
                aria-label="Previous step"
                onClick={() => setStep((s) => s - 1)}
                className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-secondary"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <span className="h-9 w-9" />
            )}
            <div className="min-w-0 text-center">
              <p className="truncate font-display text-lg leading-none tracking-tight">
                {placed ? "Order received" : STEPS[step]}
              </p>
              <p className="mt-1 text-eyebrow text-muted-foreground">
                {placed ? "Thank you" : `Step ${step + 1} of 3 · ${volume} items`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close checkout panel"
              onClick={closeCart}
              className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={`h-0.5 flex-1 transition-colors duration-300 ${
                  i <= step || placed ? "bg-gold" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {placed ? (
            <div className="pb-2">
              <div className="text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-success" />
                <h3 className="mt-4 font-display text-2xl tracking-tight">Routing complete</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Your pack reference has been queued. Delivery coordinates are stored securely and
                  never shared beyond fulfilment.
                </p>
                <p className="mt-3 inline-block border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Ref {placed.reference}
                </p>
              </div>

              <div className="mt-7 border-t border-border pt-4">
                <p className="text-eyebrow text-muted-foreground">Items</p>
                <ul className="mt-2.5 space-y-2.5">
                  {placed.items.map((i) => (
                    <li key={i.sku} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-display text-base leading-tight">
                          {i.qty} × {i.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {i.option} · SKU {i.sku}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatMoney(i.lineTotal, placed.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Subtotal ({placed.volume} items)</dt>
                  <dd className="tabular-nums">{formatMoney(placed.subtotal, placed.currency)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Dispatch</dt>
                  <dd className="tabular-nums">{formatMoney(placed.delivery, placed.currency)}</dd>
                </div>
                <div className="flex justify-between pt-1.5 font-display text-xl tracking-tight">
                  <dt>Total due</dt>
                  <dd className="tabular-nums">{formatMoney(placed.total, placed.currency)}</dd>
                </div>
              </dl>

              <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
                <div>
                  <p className="text-eyebrow text-muted-foreground">Payment route</p>
                  <p className="mt-1 font-semibold">{PROVIDER_LABEL[placedProvider]}</p>
                </div>
                <div>
                  <p className="text-eyebrow text-muted-foreground">Delivery to</p>
                  <p className="mt-1 leading-relaxed">
                    {routing.name}
                    <br />
                    {routing.address}, {routing.city}
                    <br />
                    {routing.phone}
                  </p>
                </div>
                {routing.notes.trim() && (
                  <div>
                    <p className="text-eyebrow text-muted-foreground">Delivery notes</p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{routing.notes}</p>
                  </div>
                )}
              </div>

              <a
                href={`https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(
                  buildWhatsAppMessage(placed, routing, placedProvider),
                )}`}
                target="_blank"
                rel="noreferrer noopener"
                className="magnetic mt-6 block rounded-full bg-success px-6 py-3.5 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-linen"
              >
                Send order brief on WhatsApp
              </a>
              <button
                type="button"
                onClick={closeCart}
                className="mt-3 w-full rounded-full border border-foreground/20 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-gold"
              >
                Continue shopping
              </button>
              <div className="mt-5 border border-border bg-secondary p-4">
                <p className="text-eyebrow text-muted-foreground">Your payment token</p>
                <p className="mt-2 break-all font-mono text-[11px] leading-relaxed">
                  {placed.lookupToken}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(placed.lookupToken);
                      toast.success("Payment token copied");
                    }}
                    className="rounded-full border border-foreground/20 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors hover:border-gold"
                  >
                    Copy token
                  </button>
                  <Link
                    to="/order/$token"
                    params={{ token: placed.lookupToken }}
                    className="rounded-full border border-foreground/20 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors hover:border-gold"
                  >
                    View order status
                  </Link>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                  Keep this token safe — it is the only way to check this order at{" "}
                  <Link to="/order-return" className="underline underline-offset-2">
                    /order-return
                  </Link>
                  . It expires in 30 days.
                </p>
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <Lock className="h-3 w-3" /> Details stored securely · Never resold
              </p>
            </div>
          ) : lines.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-xl tracking-tight">Your bag is empty</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add a fabric bundle or ready-to-wear piece to begin.
              </p>
              <button
                type="button"
                onClick={closeCart}
                className="mt-6 rounded-full border border-foreground/20 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-gold"
              >
                Back to catalog
              </button>
            </div>
          ) : (
            <>
              {step === 0 && (
                <ul className="space-y-4">
                  {lines.map((line) => (
                    <li key={line.key} className="flex gap-3.5 border-b border-border pb-4">
                      <img
                        src={resolveImage(line.product.image)}
                        alt={line.product.name}
                        width={1024}
                        height={1280}
                        loading="lazy"
                        className="h-24 w-20 shrink-0 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base leading-tight">
                          {line.product.name}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {line.option} · SKU {line.sku}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {money(line.unitPrice)} each
                        </p>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center border border-border">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.product.name}`}
                              onClick={() =>
                                updateQty(line.key, line.qty - (line.product.minQty >= 10 ? 5 : 1))
                              }
                              className="grid h-8 w-8 place-items-center transition-colors hover:bg-secondary"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-9 text-center text-sm font-semibold tabular-nums">
                              {line.qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase ${line.product.name}`}
                              onClick={() =>
                                updateQty(line.key, line.qty + (line.product.minQty >= 10 ? 5 : 1))
                              }
                              className="grid h-8 w-8 place-items-center transition-colors hover:bg-secondary"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="font-display text-base">{money(line.lineTotal)}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${line.product.name}`}
                            onClick={() => removeLine(line.key)}
                            className="grid h-8 w-8 place-items-center text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-eyebrow text-muted-foreground">Full name</span>
                    <input
                      className={field}
                      value={routing.name}
                      onChange={(e) => setRouting({ ...routing, name: e.target.value })}
                      placeholder="Adaeze Okonkwo"
                    />
                  </label>
                  <label className="block">
                    <span className="text-eyebrow text-muted-foreground">WhatsApp number</span>
                    <input
                      className={field}
                      inputMode="tel"
                      value={routing.phone}
                      onChange={(e) => setRouting({ ...routing, phone: e.target.value })}
                      placeholder="0803 000 0000"
                    />
                  </label>
                  <label className="block">
                    <span className="text-eyebrow text-muted-foreground">
                      Email {payWithCard ? "(receipt)" : "(optional)"}
                    </span>
                    <input
                      className={field}
                      inputMode="email"
                      value={routing.email}
                      onChange={(e) => setRouting({ ...routing, email: e.target.value })}
                      placeholder="you@email.com"
                    />
                  </label>
                  <label className="block">
                    <span className="text-eyebrow text-muted-foreground">City / State</span>
                    <input
                      className={field}
                      value={routing.city}
                      onChange={(e) => setRouting({ ...routing, city: e.target.value })}
                      placeholder="Ikeja, Lagos"
                    />
                  </label>
                  <label className="block">
                    <span className="text-eyebrow text-muted-foreground">Delivery coordinates</span>
                    <textarea
                      className={`${field} min-h-20 resize-none`}
                      value={routing.address}
                      onChange={(e) => setRouting({ ...routing, address: e.target.value })}
                      placeholder="Street, landmark, apartment"
                    />
                  </label>
                  <label className="block">
                    <span className="text-eyebrow text-muted-foreground">Delivery notes</span>
                    <textarea
                      className={`${field} min-h-16 resize-none`}
                      value={routing.notes}
                      onChange={(e) => setRouting({ ...routing, notes: e.target.value })}
                      placeholder="Preferred window, gate access, asoebi deadline"
                    />
                  </label>
                  <p className="flex gap-2 bg-secondary p-3 text-[11px] leading-relaxed text-muted-foreground">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                    Coordinates are used for dispatch only, stored securely, and never resold or
                    shared with third parties.
                  </p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  {/* Region routing — Nigeria/Africa settles in naira, elsewhere in pounds. */}
                  <div className="border border-border p-4">
                    <p className="flex items-center gap-2 text-eyebrow text-muted-foreground">
                      <Globe2 className="h-3.5 w-3.5 text-gold" /> Billing region
                    </p>
                    <div className="mt-3 flex gap-2">
                      {(["NGN", "GBP"] as Currency[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          aria-pressed={currency === c}
                          className={`flex-1 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors ${
                            currency === c
                              ? "border-charcoal bg-charcoal text-linen"
                              : "border-border text-foreground/65 hover:border-gold"
                          }`}
                        >
                          {c === "NGN" ? "Nigeria · ₦" : "International · £"}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      {currency === "NGN"
                        ? "Naira orders are processed by Paystack — card, bank transfer and other available local methods."
                        : "Pound orders are processed by Stripe — card, Apple Pay and Google Pay."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPayWithCard(true)}
                    aria-pressed={payWithCard}
                    className={`flex w-full items-start gap-3 border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      payWithCard
                        ? "border-gold bg-secondary"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <CreditCard
                      className={`mt-0.5 h-4 w-4 shrink-0 ${payWithCard ? "text-gold" : "text-muted-foreground"}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        Pay now — {PROVIDER_LABEL[cardProvider]}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        Secure hosted checkout. Your payment details never touch this site.
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayWithCard(false)}
                    aria-pressed={!payWithCard}
                    className={`flex w-full items-start gap-3 border p-4 text-left transition-colors ${
                      !payWithCard
                        ? "border-gold bg-secondary"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${!payWithCard ? "text-gold" : "text-muted-foreground"}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">WhatsApp order routing</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        Confirm with a stylist and settle on your delivery slot.
                      </span>
                    </span>
                  </button>

                  <div className="space-y-2 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-success" /> 256-bit TLS · PCI-DSS
                      compliant processing
                    </p>
                    <p>
                      Card details are tokenised by the gateway — Gedhe Couture never sees or stores
                      your card number.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!placed && lines.length > 0 && (
          <div className="border-t border-border bg-card px-5 py-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal ({volume} items)</dt>
                <dd>{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Dispatch</dt>
                <dd>{money(delivery)}</dd>
              </div>
              <div className="flex justify-between pt-1.5 font-display text-xl tracking-tight text-foreground">
                <dt>Total</dt>
                <dd>{money(total)}</dd>
              </div>
            </dl>

            {step < 2 ? (
              <button
                type="button"
                disabled={step === 1 && !routingComplete}
                onClick={() => setStep((s) => s + 1)}
                className="magnetic mt-4 w-full rounded-full bg-charcoal px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] text-linen disabled:cursor-not-allowed disabled:opacity-40"
              >
                {step === 0 ? "Continue to routing" : "Continue to payment"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !routingComplete}
                onClick={submit}
                className={`magnetic mt-4 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] disabled:cursor-not-allowed disabled:opacity-50 ${
                  payWithCard ? "bg-gold text-charcoal" : "bg-success text-linen"
                }`}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {payWithCard ? `Pay ${money(total)} securely` : "Route order on WhatsApp"}
              </button>
            )}
            {step === 2 && !routingComplete && (
              <p className="mt-2 text-center text-[11px] text-destructive">
                Complete your delivery details{payWithCard ? " and email" : ""} to continue.
              </p>
            )}
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Lock className="h-3 w-3" /> Secure checkout · No hidden fees
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
