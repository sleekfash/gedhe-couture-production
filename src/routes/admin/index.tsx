import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  LogOut,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { ProductStockEditor } from "@/components/product-stock-editor";
import { ProductImageUpload } from "@/components/product-image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminProduct,
  recordManualPayment,
  reconcileOrderPayment,
  getAdminDashboard,
  getAdminOrder,
  listAdminProducts,
  updateAdminOrder,
  updateAdminProduct,
} from "@/lib/admin.functions";
import { formatMoney, resolveImage } from "@/data/catalog";
import { volumeTiersSchema, gallerySchema } from "@/lib/product-validation";
import { getSupabaseBrowserClient } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
      { title: "Operations dashboard — Gedhe Couture" },
      {
        name: "description",
        content: "Secure order, payment, fulfilment, and catalog operations for Gedhe Couture.",
      },
      { property: "og:title", content: "Operations dashboard — Gedhe Couture" },
      {
        property: "og:description",
        content: "Secure order, payment, fulfilment, and catalog operations for Gedhe Couture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Dashboard = Awaited<ReturnType<typeof getAdminDashboard>>;
type Product = Awaited<ReturnType<typeof listAdminProducts>>[number];
type Order = Dashboard["orders"][number];

const NEW_PRODUCT: Product = {
  id: crypto.randomUUID(),
  code: "",
  name: "",
  category: "Fabrics",
  variant: "",
  description: "",
  pattern: "",
  option_label: "Choose an option",
  options: ["Default"],
  min_qty: 1,
  price_ngn: 0,
  price_gbp: 0,
  volume_tiers: [],
  stock_status: "In Stock",
  image_url: "asset:product-fabric.jpg",
  gallery: [],
  published: false,
  sort_order: 100,
};

const statusTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  pending: "secondary",
  failed: "destructive",
  cancelled: "destructive",
  delivered: "default",
};

function AdminPage() {
  const navigate = useNavigate();
  const loadDashboard = useServerFn(getAdminDashboard);
  const loadProducts = useServerFn(listAdminProducts);
  const openOrder = useServerFn(getAdminOrder);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Awaited<
    ReturnType<typeof getAdminOrder>
  > | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ page: 0, query: "", from: "", to: "" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDashboard, nextProducts] = await Promise.all([
        loadDashboard({
          data: {
            page: filters.page,
            query: filters.query,
            ...(filters.from ? { from: filters.from } : {}),
            ...(filters.to ? { to: filters.to } : {}),
          },
        }),
        loadProducts(),
      ]);
      setDashboard(nextDashboard);
      setProducts(nextProducts);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "Forbidden"
          ? "This account is signed in but is not approved for administrator access."
          : "The operations workspace could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, loadProducts, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signOut() {
    const supabase = await getSupabaseBrowserClient();
    await supabase.auth.signOut();
    await navigate({ to: "/login", replace: true });
  }

  const visibleOrders = dashboard?.orders ?? [];

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-gold" />
      </div>
    );
  if (error)
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-5 font-display text-3xl">Access unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
            <Button onClick={() => void refresh()}>Try again</Button>
          </div>
        </div>
      </main>
    );
  if (!dashboard) return null;

  return (
    <div className="min-h-screen bg-secondary/35">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              aria-label="Back to storefront"
              className="grid h-9 w-9 place-items-center rounded-full border border-border hover:border-gold"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-eyebrow text-gold">Private workspace</p>
              <h1 className="font-display text-2xl tracking-tight">Atelier operations</h1>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-eyebrow text-muted-foreground">All-time operations</p>
            <h2 className="mt-2 font-display text-4xl tracking-tight">
              Good work, keep it moving.
            </h2>
          </div>
          <Button variant="outline" onClick={() => void refresh()}>
            <ClipboardList /> Refresh data
          </Button>
        </div>
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            label="All orders"
            value={String(dashboard.metrics.total)}
            icon={<ClipboardList />}
          />
          <Metric
            label="New orders"
            value={String(dashboard.metrics.newOrders)}
            icon={<Package />}
          />
          <Metric
            label="Awaiting payment"
            value={String(dashboard.metrics.unpaid)}
            icon={<ShieldCheck />}
          />
          <Metric
            label="Fulfilment backlog"
            value={String(dashboard.metrics.backlog)}
            icon={<Package />}
          />
          <Metric
            label="Payment exceptions"
            value={String(dashboard.metrics.exceptions)}
            icon={<AlertTriangle />}
          />
          <Metric
            label="Paid revenue"
            value={`${formatMoney(dashboard.metrics.paidNgn, "NGN")} · ${formatMoney(dashboard.metrics.paidGbp, "GBP")}`}
            icon={<CircleDollarSign />}
          />
        </div>
        <Tabs defaultValue="orders">
          <TabsList className="mb-5">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="exceptions">Payment exceptions</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">
            <Card>
              <CardHeader className="gap-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Order queue</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Payment, delivery, and customer coordination.
                  </p>
                </div>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setFilters({ page: 0, query, from, to });
                  }}
                >
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Reference or customer name"
                      className="pl-9"
                    />
                  </div>
                  <Input
                    aria-label="Orders from date"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-40"
                  />
                  <Input
                    aria-label="Orders to date"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-40"
                  />
                  <Button type="submit" variant="outline">
                    Apply filters
                  </Button>
                </form>
              </CardHeader>
              <CardContent className="p-0">
                <OrdersTable
                  orders={visibleOrders}
                  onSelect={async (id) => {
                    try {
                      setSelectedOrder(await openOrder({ data: { id } }));
                    } catch {
                      toast.error("Could not open that order.");
                    }
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
                  <span>
                    {dashboard.totalMatching} matching orders · page {filters.page + 1}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={filters.page === 0}
                      onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      disabled={(filters.page + 1) * 50 >= dashboard.totalMatching}
                      onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="exceptions">
            <ExceptionsPanel
              dashboard={dashboard}
              onSelect={async (id) => {
                try {
                  setSelectedOrder(await openOrder({ data: { id } }));
                } catch {
                  toast.error("Could not open that order.");
                }
              }}
            />
          </TabsContent>
          <TabsContent value="products">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Catalog control</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create products and control what appears in the storefront.
                  </p>
                </div>
                {selectedProduct ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProduct(null);
                      setCreatingProduct(false);
                    }}
                  >
                    <X /> Close editor
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedProduct({ ...NEW_PRODUCT, id: crypto.randomUUID() });
                      setCreatingProduct(true);
                    }}
                  >
                    <Plus /> New product
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {selectedProduct ? (
                  <ProductEditor
                    product={selectedProduct}
                    creating={creatingProduct}
                    onSaved={async () => {
                      setSelectedProduct(null);
                      setCreatingProduct(false);
                      await refresh();
                    }}
                  />
                ) : (
                  <ProductsGrid
                    products={products}
                    onSelect={(product) => {
                      setSelectedProduct(product);
                      setCreatingProduct(false);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      {selectedOrder && (
        <OrderDrawer
          detail={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onSaved={async () => {
            setSelectedOrder(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className="text-gold">{icon}</span>
      </CardContent>
    </Card>
  );
}

function ExceptionsPanel({
  dashboard,
  onSelect,
}: {
  dashboard: Dashboard;
  onSelect: (id: string) => void;
}) {
  const orders = dashboard.exceptions;
  const events = dashboard.failedEvents;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Orders needing attention</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest 50 recorded payment failures and exceptions. Pending checkouts may need
            verification.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-gold" />
              <p className="mt-3 font-display text-xl">Nothing to reconcile</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No recorded exceptions. Pending payments still need confirmation.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(order.id)}
                    className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/60"
                  >
                    <span>
                      <span className="font-semibold">{order.reference}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {order.customer_name} · {order.payment_provider} · attempt{" "}
                        {order.payment_attempts}
                      </span>
                      <span className="mt-1 block text-xs text-destructive">
                        {order.last_payment_error ?? "Payment reported as failed"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Badge variant="destructive">{order.payment_status}</Badge>
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {formatMoney(Number(order.total), order.currency as "NGN" | "GBP")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Rejected provider callbacks</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest 50 rejected events, with the reason recorded.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-gold" />
              <p className="mt-3 font-display text-xl">No rejected callbacks</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No recorded rejections. This does not verify every pending payment.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <li key={`${event.provider}-${event.event_id}`} className="px-5 py-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">{event.event_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.received_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.provider} · {event.order_reference ?? "no order reference"}
                  </p>
                  <p className="mt-1 text-xs text-destructive">{event.failure_reason}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTable({ orders, onSelect }: { orders: Order[]; onSelect: (id: string) => void }) {
  return orders.length === 0 ? (
    <div className="p-10 text-center">
      <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-display text-xl">No matching orders</p>
      <p className="mt-1 text-sm text-muted-foreground">New checkout activity will appear here.</p>
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-5 py-3">Order</th>
            <th className="px-5 py-3">Customer</th>
            <th className="px-5 py-3">Payment</th>
            <th className="px-5 py-3">Fulfilment</th>
            <th className="px-5 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-secondary/60"
              onClick={() => onSelect(order.id)}
            >
              <td className="px-5 py-4 font-semibold">
                {order.reference}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {new Date(order.created_at).toLocaleString()}
                </span>
              </td>
              <td className="px-5 py-4">{order.customer_name}</td>
              <td className="px-5 py-4">
                <Badge variant={statusTone[order.payment_status] ?? "outline"}>
                  {order.payment_status}
                </Badge>
                <span className="ml-2 text-xs text-muted-foreground">{order.payment_provider}</span>
              </td>
              <td className="px-5 py-4 capitalize">{order.fulfilment_status}</td>
              <td className="px-5 py-4 text-right font-semibold tabular-nums">
                {formatMoney(Number(order.total), order.currency as "NGN" | "GBP")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderDrawer({
  detail,
  onClose,
  onSaved,
}: {
  detail: Awaited<ReturnType<typeof getAdminOrder>>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const update = useServerFn(updateAdminOrder);
  const verify = useServerFn(reconcileOrderPayment);
  const record = useServerFn(recordManualPayment);
  const [receipt, setReceipt] = useState("");
  const [receiptVerified, setReceiptVerified] = useState(false);
  async function paymentAction(manual: boolean) {
    setBusy(true);
    try {
      if (manual)
        await record({ data: { id: detail.order.id, reference: receipt, verified: true } });
      else await verify({ data: { id: detail.order.id } });
      toast.success(manual ? "Verified bank payment recorded" : "Provider status checked");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment verification failed");
    } finally {
      setBusy(false);
    }
  }
  const [status, setStatus] = useState(detail.order.fulfilment_status);
  const [notes, setNotes] = useState(detail.order.admin_notes);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await update({
        data: {
          id: detail.order.id,
          fulfilment_status: status as
            "new" | "confirmed" | "packed" | "dispatched" | "delivered" | "cancelled",
          admin_notes: notes,
        },
      });
      toast.success("Order updated");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update order.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-charcoal-deep/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-background p-6 shadow-xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-eyebrow text-gold">Order detail</p>
            <h2 className="mt-2 font-display text-3xl">{detail.order.reference}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(detail.order.created_at).toLocaleString()}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close order detail">
            <X />
          </Button>
        </div>
        <Separator className="my-6" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Customer" value={detail.order.customer_name} />
          <Info label="Phone" value={detail.order.customer_phone} />
          <Info label="Email" value={detail.order.customer_email || "—"} />
          <Info
            label="Payment"
            value={`${detail.order.payment_status} · ${detail.order.payment_provider}`}
          />
          <Info label="City" value={detail.order.city} />
          <Info label="Address" value={detail.order.address} />
        </div>
        <section className="mt-7">
          <p className="text-eyebrow text-muted-foreground">Items</p>
          <div className="mt-3 space-y-2">
            {(
              detail.order.items as {
                name: string;
                option: string;
                qty: number;
                lineTotal: number;
              }[]
            ).map((item) => (
              <div
                key={`${item.name}-${item.option}`}
                className="flex justify-between gap-4 border-b border-border pb-2 text-sm"
              >
                <span>
                  {item.qty} × {item.name}
                  <span className="block text-xs text-muted-foreground">{item.option}</span>
                </span>
                <span className="tabular-nums">
                  {formatMoney(Number(item.lineTotal), detail.order.currency as "NGN" | "GBP")}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between font-semibold">
            <span>Total</span>
            <span>
              {formatMoney(Number(detail.order.total), detail.order.currency as "NGN" | "GBP")}
            </span>
          </div>
        </section>
        <section className="mt-7 space-y-3 border-t border-border pt-6">
          <p className="text-eyebrow text-muted-foreground">Payment verification</p>
          {detail.order.last_payment_error && (
            <p className="text-sm text-destructive">{detail.order.last_payment_error}</p>
          )}
          {detail.order.payment_provider !== "whatsapp" ? (
            <Button variant="outline" disabled={busy} onClick={() => void paymentAction(false)}>
              Check status with payment provider
            </Button>
          ) : (
            detail.order.payment_status !== "paid" &&
            detail.order.fulfilment_status !== "cancelled" && (
              <>
                <Label htmlFor="receipt">Verified bank transaction reference</Label>
                <Input
                  id="receipt"
                  value={receipt}
                  onChange={(e) => setReceipt(e.target.value)}
                  maxLength={160}
                />
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={receiptVerified}
                    onChange={(e) => setReceiptVerified(e.target.checked)}
                  />
                  I checked the full amount in our bank account.
                </label>
                <Button
                  disabled={busy || !receiptVerified || receipt.trim().length < 4}
                  onClick={() => void paymentAction(true)}
                >
                  Record verified payment
                </Button>
              </>
            )
          )}
          <p className="text-xs text-muted-foreground">
            Confirm funds before dispatch. A customer screenshot alone is not bank verification.
          </p>
        </section>
        <section className="mt-7 grid gap-4 border-t border-border pt-6">
          <div>
            <Label htmlFor="fulfilment">Fulfilment status</Label>
            <select
              id="fulfilment"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-2 h-10 w-full border border-input bg-background px-3 text-sm capitalize"
            >
              <option value="new">New</option>
              <option value="confirmed">Confirmed</option>
              <option value="packed">Packed</option>
              <option value="dispatched">Dispatched</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <Label htmlFor="admin-notes">Internal notes</Label>
            <Textarea
              id="admin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 min-h-24"
              placeholder="Production or delivery notes"
            />
          </div>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />} Save changes
          </Button>
        </section>
        <section className="mt-7 border-t border-border pt-6">
          <p className="text-eyebrow text-muted-foreground">Payment events</p>
          <div className="mt-3 space-y-3">
            {detail.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider event recorded yet.</p>
            ) : (
              detail.events.map((event) => (
                <div key={`${event.provider}-${event.event_id}`} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">{event.event_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.received_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {event.provider} ·{" "}
                    {event.failure_reason ?? (event.processed_at ? "processed" : "pending")}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="mt-7 border-t border-border pt-6">
          <p className="text-eyebrow text-muted-foreground">Order activity</p>
          <ul className="mt-3 space-y-3">
            {detail.audit.length === 0 ? (
              <li className="text-sm text-muted-foreground">No activity recorded yet.</li>
            ) : (
              detail.audit.map((event, i) => (
                <li key={`${event.created_at}-${i}`} className="text-sm">
                  <strong>{event.event_type.replaceAll("_", " ")}</strong>
                  <p>
                    {event.from_value && `${event.from_value} → `}
                    {event.to_value} {event.note}
                  </p>
                  <time className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </li>
              ))
            )}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-secondary/30 p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

function ProductsGrid({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
}) {
  return products.length === 0 ? (
    <div className="py-10 text-center text-sm text-muted-foreground">No products found.</div>
  ) : (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {products.map((product) => (
        <button
          type="button"
          key={product.id}
          onClick={() => onSelect(product)}
          className="group overflow-hidden border border-border bg-background text-left transition-colors hover:border-gold"
        >
          <div className="aspect-[4/3] overflow-hidden bg-secondary">
            <img
              src={resolveImage(product.image_url)}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg">{product.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {product.code} · {product.category}
                </p>
              </div>
              <Badge variant={product.published ? "default" : "outline"}>
                {product.published ? "Live" : "Hidden"}
              </Badge>
            </div>
            <p className="mt-4 text-sm font-semibold">
              {formatMoney(Number(product.price_ngn), "NGN")} ·{" "}
              {formatMoney(Number(product.price_gbp), "GBP")}
            </p>
            <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
              <Pencil className="h-3 w-3" /> Edit product
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProductEditor({
  product,
  creating,
  onSaved,
}: {
  product: Product;
  creating: boolean;
  onSaved: () => Promise<void>;
}) {
  const saveProduct = useServerFn(updateAdminProduct);
  const addProduct = useServerFn(createAdminProduct);
  const [form, setForm] = useState({
    ...product,
    optionsText: product.options.join(", "),
  });
  const [tiers, setTiers] = useState(() => volumeTiersSchema.parse(product.volume_tiers));
  const [gallery, setGallery] = useState(() => gallerySchema.parse(product.gallery));
  const [busy, setBusy] = useState(false);
  function set(key: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  async function save() {
    setBusy(true);
    try {
      const volume_tiers = volumeTiersSchema.parse(tiers);
      gallerySchema.parse(gallery);
      const data = {
        code: form.code,
        name: form.name,
        category: form.category as "Fabrics" | "Ready-to-Wear" | "Asoebi",
        variant: form.variant,
        description: form.description,
        pattern: form.pattern,
        option_label: form.option_label,
        options: form.optionsText
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        min_qty: Number(form.min_qty),
        price_ngn: Number(form.price_ngn),
        price_gbp: Number(form.price_gbp),
        volume_tiers,
        stock_status: form.stock_status as "In Stock" | "Limited Stock" | "Inquire for Timeline",
        image_url: form.image_url,
        gallery,
        published: Boolean(form.published),
        sort_order: Number(form.sort_order),
      };
      if (creating) await addProduct({ data });
      else await saveProduct({ data: { id: form.id, ...data } });
      toast.success(creating ? "Product created" : "Product saved");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check the product details and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-7 lg:grid-cols-[0.7fr_1.3fr]">
      <div className="overflow-hidden border border-border bg-secondary">
        <img
          src={resolveImage(form.image_url)}
          alt={form.name || "Product preview"}
          className="aspect-[4/3] h-full w-full object-cover"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["name", "Product name"],
            ["code", "Code"],
            ["category", "Category"],
            ["variant", "Variant"],
            ["stock_status", "Stock status"],
            ["option_label", "Option label"],
            ["image_url", "Main image URL"],
            ["pattern", "Pattern"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              value={String(form[key])}
              onChange={(e) => set(key, e.target.value)}
              className="mt-2"
            />
          </div>
        ))}
        <div>
          <Label htmlFor="price_ngn">Price (NGN)</Label>
          <Input
            id="price_ngn"
            type="number"
            value={String(form.price_ngn)}
            onChange={(e) => set("price_ngn", Number(e.target.value))}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="price_gbp">Price (GBP)</Label>
          <Input
            id="price_gbp"
            type="number"
            step="0.01"
            value={String(form.price_gbp)}
            onChange={(e) => set("price_gbp", Number(e.target.value))}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="min_qty">Minimum quantity</Label>
          <Input
            id="min_qty"
            type="number"
            value={String(form.min_qty)}
            onChange={(e) => set("min_qty", Number(e.target.value))}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="sort_order">Display order</Label>
          <Input
            id="sort_order"
            type="number"
            value={String(form.sort_order)}
            onChange={(e) => set("sort_order", Number(e.target.value))}
            className="mt-2"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <Label htmlFor="options">Options, comma separated</Label>
          <Input
            id="options"
            value={form.optionsText}
            onChange={(e) => set("optionsText", e.target.value)}
            className="mt-2"
          />
        </div>
        <div className="flex items-end gap-3 pb-2">
          <input
            id="published"
            type="checkbox"
            checked={Boolean(form.published)}
            onChange={(e) => set("published", e.target.checked)}
            className="h-4 w-4 accent-[var(--gold)]"
          />
          <Label htmlFor="published">Published in storefront</Label>
        </div>
        <div className="sm:col-span-2 space-y-3">
          <ProductImageUpload onUploaded={(url) => set("image_url", url)} />
          <h3 className="font-semibold">Volume pricing</h3>
          {tiers.map((tier, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-5">
              <Input
                aria-label={`Tier ${i + 1} minimum quantity`}
                type="number"
                min="1"
                value={tier.minQty}
                onChange={(e) =>
                  setTiers((v) =>
                    v.map((t, j) => (j === i ? { ...t, minQty: Number(e.target.value) } : t)),
                  )
                }
              />
              <Input
                aria-label={`Tier ${i + 1} label`}
                placeholder="Label"
                value={tier.label}
                onChange={(e) =>
                  setTiers((v) => v.map((t, j) => (j === i ? { ...t, label: e.target.value } : t)))
                }
              />
              <Input
                aria-label={`Tier ${i + 1} NGN price`}
                type="number"
                step="0.01"
                value={tier.unitPriceNgn}
                onChange={(e) =>
                  setTiers((v) =>
                    v.map((t, j) => (j === i ? { ...t, unitPriceNgn: Number(e.target.value) } : t)),
                  )
                }
              />
              <Input
                aria-label={`Tier ${i + 1} GBP price`}
                type="number"
                step="0.01"
                value={tier.unitPriceGbp}
                onChange={(e) =>
                  setTiers((v) =>
                    v.map((t, j) => (j === i ? { ...t, unitPriceGbp: Number(e.target.value) } : t)),
                  )
                }
              />
              <Button
                variant="outline"
                onClick={() => setTiers((v) => v.filter((_, j) => j !== i))}
              >
                Remove tier
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setTiers((v) => [
                ...v,
                {
                  minQty: 1,
                  label: "",
                  unitPriceNgn: Number(form.price_ngn),
                  unitPriceGbp: Number(form.price_gbp),
                },
              ])
            }
          >
            Add volume tier
          </Button>
          <h3 className="font-semibold">Product gallery</h3>
          {gallery.map((image, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label={`Gallery ${i + 1} image URL`}
                value={image.src}
                onChange={(e) =>
                  setGallery((v) => v.map((g, j) => (j === i ? { ...g, src: e.target.value } : g)))
                }
              />
              <Input
                aria-label={`Gallery ${i + 1} caption`}
                value={image.caption}
                placeholder="Caption"
                onChange={(e) =>
                  setGallery((v) =>
                    v.map((g, j) => (j === i ? { ...g, caption: e.target.value } : g)),
                  )
                }
              />
              <Button
                variant="outline"
                onClick={() => setGallery((v) => v.filter((_, j) => j !== i))}
              >
                Remove image
              </Button>
            </div>
          ))}
          <ProductImageUpload
            onUploaded={(src) => setGallery((v) => [...v, { src, caption: "" }])}
          />
          <Button
            variant="outline"
            onClick={() => setGallery((v) => [...v, { src: form.image_url, caption: "" }])}
          >
            Add gallery image by URL
          </Button>
          {!creating && <ProductStockEditor id={product.id} options={product.options} />}
          {creating && (
            <p className="text-xs text-muted-foreground">
              Save this product first, then reopen it to enter stock quantities.
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}{" "}
            {creating ? "Create product" : "Save product"}
          </Button>
        </div>
      </div>
    </div>
  );
}
