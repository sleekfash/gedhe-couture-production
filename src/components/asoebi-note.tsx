/** Editorial interlude selling the Asoebi bulk vertical. */
import { useStore } from "@/lib/store";

export function AsoebiNote() {
  const { setFilter } = useStore();

  return (
    <section className="border-y border-border bg-secondary">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
        <div className="min-w-0">
          <p className="text-eyebrow text-clay">Asoebi Desk</p>
          <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
            Dressing a whole party, without the panic.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Minimum ten packs, tiered pricing from 25 and 50 packs, matched dye lots across every
            bundle and a single coordinator handling colour approval, sizing sheets and dispatch
            timelines.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter("Asoebi");
              document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="magnetic mt-7 rounded-full bg-clay px-7 py-3.5 text-[11px] font-bold uppercase tracking-[0.22em] text-clay-foreground"
          >
            View bulk pricing
          </button>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-border">
          {[
            { k: "10", v: "Pack minimum" },
            { k: "3", v: "Volume tiers" },
            { k: "48h", v: "Colour approval" },
          ].map((stat) => (
            <div key={stat.v} className="bg-card px-4 py-8 text-center">
              <dt className="font-display text-3xl tracking-tight sm:text-4xl">{stat.k}</dt>
              <dd className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {stat.v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
