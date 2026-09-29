import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { StoreProvider } from "@/lib/store";
import { publishedProductsQueryOptions } from "@/lib/catalog.functions";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { Catalog } from "@/components/catalog";
import { AsoebiNote } from "@/components/asoebi-note";
import { Verticals } from "@/components/verticals";
import { CartPanel } from "@/components/cart-panel";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "Gedhe Couture — Ankara, Thrift & Asoebi Bulk";
const DESCRIPTION =
  "Gedhe Couture creates and curates stylish pieces for the modern woman: Ankara fabrics and ready-to-wear, curated thrift and vintage fashion, and affordable asoebi bulk supply.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publishedProductsQueryOptions()),
  component: Index,
});

function Index() {
  const { data: products } = useSuspenseQuery(publishedProductsQueryOptions());

  return (
    <StoreProvider products={products}>
      <SiteHeader />
      <main>
        <Hero />
        <Verticals />
        <Catalog />
        <AsoebiNote />
      </main>
      <SiteFooter />
      <CartPanel />
    </StoreProvider>
  );
}
