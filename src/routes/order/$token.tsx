import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  MessageCircle,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getOrderByLookupToken,
  retryOrderPayment,
  type PublicOrderStatus,
} from "@/lib/checkout.functions";
import { CART_STORAGE_KEY, parseStoredCart } from "@/lib/cart-storage";
import { BRAND, formatMoney } from "@/data/catalog";

const TITLE = "Order status — Gedhe Couture";
const DESCRIPTION = "Secure payment and fulfilment status for your Gedhe Couture order.";

export const Route = createFileRoute("/order/$token")({
  loader: ({ params }) => getOrderByLookupToken({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => (
    <StatusShell>
      <div className="mt-12 border p-8 text-center">
        <h1 className="font-display text-3xl">Order status temporarily unavailable</h1>
        <p className="mt-3">Please refresh this page. Your saved order has not been removed.</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Refresh status
        </Button>
      </div>
    </StatusShell>
  ),
  notFoundComponent: () => (
    <StatusShell>
      <UnknownOrder />
    </StatusShell>
  ),
  component: OrderStatusPage,
});

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-secondary/40 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to storefront
        </Link>
        {children}
      </div>
    </main>
  );
}

function UnknownOrder() {
  return (
    <div className="mt-12 border border-border bg-background p-8 text-center sm:p-12">
      <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-5 font-display text-3xl">Order not available</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        This payment token is invalid, expired, or not ready yet. Please return to checkout and use
        the complete token.
      </p>
      <Button asChild className="mt-6">
        <Link to="/order-return">Try another token</Link>
      </Button>
    </div>
  );
}

function OrderStatusPage() {
  const order = Route.useLoaderData();
  const { token } = Route.useParams();
  useEffect(() => {
    if (order?.payment_status !== "paid") return;
    try {
      const submission = JSON.parse(localStorage.getItem("gedhe-checkout-request") ?? "null");
      if (submission?.lookupToken !== token) return;
      const cart = parseStoredCart(localStorage.getItem(CART_STORAGE_KEY));
      const items = order.items as ((typeof order.items)[number] & { productId?: string })[];
      const matches =
        cart.length === items.length &&
        cart.every((l) =>
          items.some(
            (i) => i.productId === l.productId && i.option === l.option && i.qty === l.qty,
          ),
        );
      if (matches) localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem("gedhe-checkout-request");
    } catch {
      /* Preserve the bag if storage is unavailable. */
    }
  }, [order, token]);
  return (
    <StatusShell>
      {order ? <OrderStatus order={order} token={token} /> : <UnknownOrder />}
    </StatusShell>
  );
}

const STATE_COPY: Record<string, { title: string; body: string }> = {
  paid: {
    title: "Payment confirmed",
    body: "Your order is now eligible for fulfilment. We will keep you updated as it moves through the atelier.",
  },
  pending: {
    title: "Payment is being confirmed",
    body: "Confirmation is authoritative only after the payment provider callback reaches us. Refresh this page in a moment.",
  },
  failed: {
    title: "Payment did not complete",
    body: "The provider did not confirm this payment. You can retry securely below or contact the atelier.",
  },
  cancelled: {
    title: "Payment cancelled",
    body: "This payment was cancelled before it completed. You can retry securely below.",
  },
  refunded: {
    title: "Payment refunded",
    body: "This order has been refunded. Contact the atelier if you expected something different.",
  },
};

function OrderStatus({ order, token }: { order: PublicOrderStatus; token: string }) {
  const retry = useServerFn(retryOrderPayment);
  const [busy, setBusy] = useState(false);
  const paid = order.payment_status === "paid";
  const failed = ["failed", "cancelled"].includes(order.payment_status);
  const isWhatsAppOrder = order.payment_provider === "whatsapp";
  const canRetry =
    !paid &&
    order.payment_status !== "refunded" &&
    order.fulfilment_status !== "cancelled" &&
    !isWhatsAppOrder &&
    (order.payment_provider === "stripe" || order.payment_provider === "paystack");
  const copy = STATE_COPY[order.payment_status] ?? STATE_COPY["pending"]!;

  async function restartPayment() {
    if (busy) return;
    setBusy(true);
    try {
      const { checkoutUrl } = await retry({ data: { token } });
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment could not be restarted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-10 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-eyebrow text-gold">Order confirmation</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight">{order.reference}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your order is securely linked to {order.contact_hint.toLowerCase()}.
          </p>
        </div>
        <Badge variant={paid ? "default" : failed ? "destructive" : "secondary"}>
          {order.payment_status}
        </Badge>
      </div>

      <Card className="mt-8 overflow-hidden">
        <CardContent className="p-0">
          <div
            className={`flex gap-4 p-6 ${
              paid ? "bg-success/10" : failed ? "bg-destructive/10" : "bg-secondary"
            }`}
          >
            {paid ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 text-success" />
            ) : failed ? (
              <AlertCircle className="mt-0.5 h-6 w-6 text-destructive" />
            ) : (
              <Clock3 className="mt-0.5 h-6 w-6 text-gold" />
            )}
            <div>
              <p className="font-semibold">
                {isWhatsAppOrder && !paid ? "Awaiting atelier confirmation" : copy.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {isWhatsAppOrder && !paid
                  ? "This order was routed on WhatsApp. A stylist confirms your pack and payment directly with you."
                  : copy.body}
              </p>
            </div>
          </div>
          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <div>
              <p className="text-eyebrow text-muted-foreground">Fulfilment</p>
              <p className="mt-2 flex items-center gap-2 font-semibold capitalize">
                <PackageCheck className="h-4 w-4 text-gold" /> {order.fulfilment_status}
              </p>
            </div>
            <div>
              <p className="text-eyebrow text-muted-foreground">Payment route</p>
              <p className="mt-2 font-semibold capitalize">{order.payment_provider}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-6">
          <p className="text-eyebrow text-muted-foreground">Your items</p>
          <div className="mt-4 space-y-3">
            {order.items.map((item) => (
              <div
                key={`${item.sku}-${item.option}`}
                className="flex justify-between gap-4 border-b border-border pb-3 text-sm"
              >
                <span>
                  <span className="font-semibold">
                    {item.qty} × {item.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.option} · {item.sku}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(item.lineTotal, order.currency)}
                </span>
              </div>
            ))}
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.subtotal, order.currency)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Dispatch</dt>
              <dd>{formatMoney(order.delivery_fee, order.currency)}</dd>
            </div>
            <div className="flex justify-between pt-2 font-display text-2xl">
              <dt>Total</dt>
              <dd>{formatMoney(order.total, order.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        {canRetry && (
          <Button onClick={restartPayment} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Retry payment securely
          </Button>
        )}
        <Button variant={canRetry ? "outline" : "default"} asChild>
          <a href={`https://wa.me/${BRAND.whatsapp}`} target="_blank" rel="noreferrer noopener">
            <MessageCircle /> Contact atelier
          </a>
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(token);
            toast.success("Payment token copied");
          }}
        >
          <Copy /> Copy token
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/">Continue shopping</Link>
        </Button>
      </div>
    </>
  );
}
