/** Public storefront catalog reads. */
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import type { Product } from "@/data/catalog";
import { PRODUCT_COLUMNS, mapProduct, type ProductRow } from "@/lib/product-mapper";

export const listPublishedProducts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Product[]> => {
    const { createPublicClient } = await import("@/lib/supabase-public.server");
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("published", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("listPublishedProducts failed", error);
      throw new Error("The catalog is temporarily unavailable. Please try again.");
    }
    return withStock((data as unknown as ProductRow[]).map(mapProduct));
  },
);

export const publishedProductsQueryOptions = () =>
  queryOptions({
    queryKey: ["published-products"],
    queryFn: () => listPublishedProducts(),
  });

export const getPublishedProduct = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Product | null> => {
    const { createPublicClient } = await import("@/lib/supabase-public.server");
    const { data: row, error } = await createPublicClient()
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("id", data.id)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error("Product details are temporarily unavailable.");
    if (!row) return null;
    return (await withStock([mapProduct(row as unknown as ProductRow)]))[0] ?? null;
  });

async function withStock(products: Product[]): Promise<Product[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("product_stock_availability", {});
  if (error) throw new Error("Product availability is temporarily unavailable.");
  const rows = data as unknown as { product_id: string; option: string; available: number }[];
  return products.map((p) => ({
    ...p,
    inventory: Object.fromEntries(
      rows.filter((r) => r.product_id === p.id).map((r) => [r.option, Number(r.available)]),
    ),
  }));
}
