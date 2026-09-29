/** Shared database-row → domain-product mapping (used on server and client). */
import type { Category, Product, StockStatus, VolumeTier } from "@/data/catalog";

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  category: string;
  variant: string;
  description: string;
  pattern: string;
  option_label: string;
  options: string[] | null;
  min_qty: number;
  price_ngn: number;
  price_gbp: number | string;
  volume_tiers: unknown;
  stock_status: string;
  image_url: string;
  gallery: unknown;
  published: boolean;
  sort_order: number;
}

function toTiers(value: unknown): VolumeTier[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const t = raw as Record<string, unknown>;
    return {
      minQty: Number(t["minQty"] ?? 1),
      label: String(t["label"] ?? ""),
      unitPriceNgn: Number(t["unitPriceNgn"] ?? 0),
      unitPriceGbp: Number(t["unitPriceGbp"] ?? 0),
    };
  });
}

function toGallery(value: unknown, fallback: string): { src: string; caption: string }[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ src: fallback, caption: "" }];
  }
  return value.map((raw) => {
    const g = raw as Record<string, unknown>;
    return { src: String(g["src"] ?? fallback), caption: String(g["caption"] ?? "") };
  });
}

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category as Category,
    variant: row.variant,
    base_price: Number(row.price_ngn),
    price_gbp: Number(row.price_gbp),
    stock_status: row.stock_status as StockStatus,
    description: row.description,
    image: row.image_url,
    gallery: toGallery(row.gallery, row.image_url),
    pattern: row.pattern,
    options: row.options ?? [],
    optionLabel: row.option_label,
    minQty: row.min_qty,
    volumeTiers: toTiers(row.volume_tiers),
    published: row.published,
    sortOrder: row.sort_order,
  };
}

export const PRODUCT_COLUMNS =
  "id, code, name, category, variant, description, pattern, option_label, options, min_qty, price_ngn, price_gbp, volume_tiers, stock_status, image_url, gallery, published, sort_order";
