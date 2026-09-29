/** Sticky brand bar with live cart volume badge. */
import { useState } from "react";
import { ShoppingBag, Instagram, Menu, X } from "lucide-react";
import { CATEGORIES, VERTICALS } from "@/data/catalog";
import { useStore } from "@/lib/store";

const PRIMARY_SOCIAL = VERTICALS.find((v) => v.instagram);
const NAV_LABELS = new Map(CATEGORIES.map((category) => [category.key, category.label]));

export function SiteHeader() {
  const { volume, openCart, setFilter } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const goHome = () => {
    if (window.location.pathname !== "/") {
      window.location.assign("/");
      return;
    }
    setFilter("All");
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToCatalog = (category: (typeof VERTICALS)[number]["key"]) => {
    if (window.location.pathname !== "/") {
      window.location.assign(`/?category=${encodeURIComponent(category)}#catalog`);
      return;
    }
    setFilter(category);
    setMenuOpen(false);
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3.5 sm:px-8">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            goHome();
          }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/60 font-display text-sm text-gold">
            GC
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-lg leading-none tracking-tight">
              Gedhe <span className="text-clay">Couture</span>
            </span>
            <span className="mt-1 block text-eyebrow text-muted-foreground">
              Three verticals, one standard of finish
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-5 lg:flex" aria-label="Main navigation">
          <button
            type="button"
            onClick={goHome}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70 hover:text-clay"
          >
            Home
          </button>
          {VERTICALS.map((vertical) => (
            <button
              key={vertical.key}
              type="button"
              onClick={() => goToCatalog(vertical.key)}
              className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70 hover:text-clay"
            >
              {NAV_LABELS.get(vertical.key) ?? vertical.label}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          {PRIMARY_SOCIAL?.instagram && (
            <a
              href={PRIMARY_SOCIAL.instagram}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Visit ${PRIMARY_SOCIAL.label} on Instagram`}
              className="grid h-10 w-10 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Instagram className="h-[18px] w-[18px]" />
            </a>
          )}
          <button
            type="button"
            onClick={openCart}
            aria-label={`Open bag, ${volume} items`}
            className="relative flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-xs font-semibold tracking-wide transition-colors hover:border-gold hover:bg-secondary"
          >
            <ShoppingBag className="h-[17px] w-[17px]" />
            <span className="hidden sm:inline">Bag</span>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-charcoal px-1.5 text-[11px] font-bold text-linen">
              {volume}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 place-items-center rounded-full text-foreground/75 transition-colors hover:bg-secondary lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          id="mobile-navigation"
          className="border-t border-border/70 bg-background px-5 py-4 lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            <button
              type="button"
              onClick={goHome}
              className="rounded-md px-3 py-3 text-left text-sm font-semibold hover:bg-secondary"
            >
              Home
            </button>
            {VERTICALS.map((vertical) => (
              <button
                key={vertical.key}
                type="button"
                onClick={() => goToCatalog(vertical.key)}
                className="rounded-md px-3 py-3 text-left text-sm font-semibold hover:bg-secondary"
              >
                {NAV_LABELS.get(vertical.key) ?? vertical.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
