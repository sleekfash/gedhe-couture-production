/** Direct access to Gedhe Couture's three verticals. */
import { Instagram, MessageCircle } from "lucide-react";
import { BRAND, VERTICALS } from "@/data/catalog";
import { useStore } from "@/lib/store";

export function Verticals() {
  const { setFilter } = useStore();

  return (
    <section id="house" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="grid gap-5 sm:grid-cols-3">
          {VERTICALS.map((vertical) => (
            <article
              key={vertical.key}
              className="flex flex-col border border-border bg-card p-6 transition-colors hover:border-gold"
            >
              <h3 className="font-display text-xl leading-tight tracking-tight">
                {vertical.label}
              </h3>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {vertical.blurb}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFilter(vertical.key);
                    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="rounded-full border border-foreground/20 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors hover:border-gold"
                >
                  Shop this edit
                </button>
                {vertical.instagram ? (
                  <a
                    href={vertical.instagram}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Instagram className="h-3.5 w-3.5" /> @{vertical.handle}
                  </a>
                ) : (
                  <a
                    href={`https://wa.me/${BRAND.whatsapp}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp desk
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
