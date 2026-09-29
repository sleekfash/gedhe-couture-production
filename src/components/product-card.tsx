/**
 * Edge-to-edge merchandising card. Consumes a structured Product metadata
 * object only — title, pattern, price attributes, stock status, variants.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Minus, Plus, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { buildSku, priceIn, resolveImage, tierPriceIn, type Product } from "@/data/catalog";
import { useStore } from "@/lib/store";
import { QuickViewModal } from "@/components/quick-view-modal";

const STOCK_STYLES: Record<Product["stock_status"], string> = {
  "In Stock": "text-success before:bg-success",
  "Limited Stock": "text-clay before:bg-clay",
  "Inquire for Timeline": "text-muted-foreground before:bg-muted-foreground",
};

export function ProductCard({ product }: { product: Product }) {
  const { addLine, openCart, currency, money } = useStore();
  const [option, setOption] = useState<string>(product.options[0] ?? product.variant);
  const [qty, setQty] = useState(product.minQty);
  const [justAdded, setJustAdded] = useState(false);
  const [quickView, setQuickView] = useState(false);

  const basePrice = currency === "NGN" ? product.base_price : product.price_gbp;
  const unitPrice = priceIn(product, qty, currency);
  const tierApplied = unitPrice < basePrice;
  const step = product.minQty >= 10 ? 5 : 1;

  function handleAdd() {
    addLine(product, option, qty);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1600);
    toast.success(`${product.name} added`, {
      description: `${buildSku(product, option)} · ${option} · ${qty} × ${money(unitPrice)}`,
      action: { label: "View bag", onClick: openCart },
    });
  }

  return (
    <article className="group flex flex-col border border-border bg-card transition-shadow duration-500 hover:shadow-[var(--shadow-editorial)]">
      <div className="media-zoom relative aspect-[4/5] bg-secondary">
        <Link
          to="/product/$productId"
          params={{ productId: product.id }}
          aria-label={`View ${product.name}`}
          className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
        >
          <img
            src={resolveImage(product.image)}
            alt={`${product.name} — ${product.pattern} Ankara print`}
            width={1024}
            height={1280}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </Link>
        <span className="absolute left-0 top-4 bg-charcoal px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-linen">
          {product.category}
        </span>
        <button
          type="button"
          onClick={() => setQuickView(true)}
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/95 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] opacity-100 shadow-[var(--shadow-editorial)] transition-all duration-300 hover:bg-background md:opacity-0 md:group-hover:opacity-100"
        >
          <ZoomIn className="h-3.5 w-3.5 text-gold" /> Quick view
        </button>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Catalog-SEO micro-layout: isolated title / stock / price blocks. */}
        <header className="min-w-0">
          <h3 className="font-display text-xl leading-snug tracking-tight">
            <Link
              to="/product/$productId"
              params={{ productId: product.id }}
              className="hover:text-clay"
            >
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-eyebrow text-muted-foreground">
            {product.pattern} · {product.variant}
          </p>
        </header>

        <p
          className={`mt-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] before:h-1.5 before:w-1.5 before:rounded-full before:content-[''] ${STOCK_STYLES[product.stock_status]}`}
        >
          {product.stock_status}
        </p>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{product.description}</p>

        <div className="mt-5">
          <p className="text-eyebrow text-muted-foreground">{product.optionLabel}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {product.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setOption(opt)}
                aria-pressed={option === opt}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  option === opt
                    ? "border-charcoal bg-charcoal text-linen"
                    : "border-border text-foreground/70 hover:border-gold hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {product.volumeTiers.length > 0 && (
          <ul className="mt-4 space-y-1 border-l-2 border-gold/70 pl-3">
            {product.volumeTiers.map((tier) => (
              <li
                key={tier.minQty}
                className={`flex items-center justify-between text-xs ${
                  unitPrice === tierPriceIn(tier, currency)
                    ? "font-bold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <span>{tier.label}</span>
                <span>{money(tierPriceIn(tier, currency))} / pack</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-6">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none tracking-tight">
                {money(unitPrice)}
              </p>
              <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {tierApplied
                  ? "Volume rate applied"
                  : `Per ${product.minQty >= 10 ? "pack" : "piece"}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center border border-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(product.minQty, q - step))}
                className="grid h-9 w-9 place-items-center text-foreground/70 transition-colors hover:bg-secondary"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => q + step)}
                className="grid h-9 w-9 place-items-center text-foreground/70 transition-colors hover:bg-secondary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className={`magnetic mt-4 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] ${
              justAdded ? "bg-success text-linen" : "bg-charcoal text-linen hover:bg-charcoal-deep"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="h-4 w-4" /> Added to bag
              </>
            ) : (
              <>Add · {money(unitPrice * qty)}</>
            )}
          </button>
          <p className="mt-2.5 text-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            SKU {buildSku(product, option)}
          </p>
        </div>
      </div>

      <QuickViewModal
        product={product}
        open={quickView}
        onClose={() => setQuickView(false)}
        onAdd={handleAdd}
      />
    </article>
  );
}
