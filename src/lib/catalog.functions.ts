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
      return [];
    }
    return (data as unknown as ProductRow[]).map(mapProduct);
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
    if (error || !row) return null;
    return mapProduct(row as unknown as ProductRow);
  });
