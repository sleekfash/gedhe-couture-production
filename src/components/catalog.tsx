/** Decoupled catalog surface: sticky filter bar + smart merchandising grid. */
import { CATEGORIES } from "@/data/catalog";
import { useStore } from "@/lib/store";
import { ProductCard } from "@/components/product-card";

export function Catalog() {
  const { filter, setFilter, visibleProducts } = useStore();
  const activeMeta = CATEGORIES.find((c) => c.key === filter);

  return (
    <section id="catalog" className="scroll-mt-16">
      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 sm:pt-24">
        <p className="text-eyebrow text-clay">The Catalog</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight tracking-tight sm:text-5xl">
          Shop the house edit.
        </h2>
      </div>

      {/* Sticky filter bar — instant vertical switching. */}
      <div className="sticky top-[65px] z-30 mt-8 border-y border-border bg-background/90 backdrop-blur-md">
        <div
          className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-5 py-3 sm:px-8"
          role="tablist"
          aria-label="Product verticals"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={filter === cat.key}
              onClick={() => setFilter(cat.key)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors ${
                filter === cat.key
                  ? "border-charcoal bg-charcoal text-linen"
                  : "border-border text-foreground/65 hover:border-gold hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {visibleProducts.length} {visibleProducts.length === 1 ? "piece" : "pieces"} ·{" "}
          {activeMeta?.blurb}
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
