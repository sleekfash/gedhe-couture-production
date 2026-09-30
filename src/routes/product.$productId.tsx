import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { CartPanel } from "@/components/cart-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buildSku, priceIn, resolveImage } from "@/data/catalog";
import { publishedProductsQueryOptions } from "@/lib/catalog.functions";
import { StoreProvider, useStore } from "@/lib/store";

export const Route = createFileRoute("/product/$productId")({
  loader: async ({ params, context }) => {
    const products = await context.queryClient.ensureQueryData(publishedProductsQueryOptions());
    const product = products.find((item) => item.id === params.productId);
    if (!product) throw notFound();
    return { product, products };
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    const title = product ? `${product.name} — Gedhe Couture` : "Product — Gedhe Couture";
    const description = product?.description ?? "Shop Gedhe Couture.";
    return { meta: [{ title }, { name: "description", content: description }] };
  },
  component: ProductRoute,
});

function ProductRoute() {
  const { products } = Route.useLoaderData();
  return (
    <StoreProvider products={products}>
      <SiteHeader />
      <ProductDetail />
      <SiteFooter />
      <CartPanel />
    </StoreProvider>
  );
}

function ProductDetail() {
  const { product } = Route.useLoaderData();
  const { addLine, openCart, currency, money } = useStore();
  const [option, setOption] = useState(product.options[0] ?? product.variant);
  const [qty, setQty] = useState(product.minQty);
  const [frame, setFrame] = useState(0);
  const [added, setAdded] = useState(false);
  const step = product.minQty >= 10 ? 5 : 1;
  const unitPrice = priceIn(product, qty, currency);
  const gallery = product.gallery.length
    ? product.gallery
    : [{ src: product.image, caption: product.name }];

  function add() {
    addLine(product, option, qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
    toast.success(`${product.name} added`, {
      description: `${buildSku(product, option)} · ${qty} × ${money(unitPrice)}`,
      action: { label: "View bag", onClick: openCart },
    });
  }

  return (
    <main className="bg-background">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          to="/"
          hash="catalog"
          className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground hover:text-clay"
        >
          ← Back to catalog
        </Link>
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.75fr)] lg:gap-14">
          <section aria-label={`${product.name} gallery`}>
            <div className="aspect-[4/5] overflow-hidden bg-secondary">
              <img
                src={resolveImage(gallery[frame]!.src)}
                alt={`${product.name} — ${gallery[frame]!.caption}`}
                className="h-full w-full object-cover"
              />
            </div>
            {gallery.length > 1 && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {gallery.map((image, index) => (
                  <button
                    key={`${image.src}-${index}`}
                    type="button"
                    onClick={() => setFrame(index)}
                    aria-pressed={frame === index}
                    className={`aspect-square overflow-hidden border ${frame === index ? "border-gold" : "border-border"}`}
                  >
                    <img
                      src={resolveImage(image.src)}
                      alt={image.caption}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-eyebrow text-gold">{product.category}</p>
            <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 text-sm uppercase tracking-[0.14em] text-muted-foreground">
              {product.pattern} · {product.variant}
            </p>
            <p className="mt-6 text-base leading-7 text-muted-foreground">{product.description}</p>
            <p className="mt-5 text-sm font-semibold">{product.stock_status}</p>

            <div className="mt-8 border-t border-border pt-6">
              <p className="text-eyebrow text-muted-foreground">{product.optionLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {product.options.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setOption(item)}
                    aria-pressed={option === item}
                    className={`rounded-full border px-4 py-2 text-sm ${option === item ? "border-charcoal bg-charcoal text-linen" : "border-border hover:border-gold"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-end justify-between gap-5 border-t border-border pt-6">
              <div>
                <p className="font-display text-3xl">{money(unitPrice)}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Per {product.minQty >= 10 ? "pack" : "piece"}
                </p>
              </div>
              <div className="flex items-center border border-border">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQty((value) => Math.max(product.minQty, value - step))}
                  className="grid h-11 w-11 place-items-center"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center font-semibold tabular-nums">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQty((value) => value + step)}
                  className="grid h-11 w-11 place-items-center"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={add}
              className={`mt-6 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] ${added ? "bg-success text-linen" : "bg-charcoal text-linen hover:bg-charcoal-deep"}`}
            >
              {added ? (
                <>
                  <Check className="h-4 w-4" /> Added to bag
                </>
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" /> Add · {money(unitPrice * qty)}
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              SKU {buildSku(product, option)}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
