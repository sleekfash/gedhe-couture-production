/**
 * ── PRODUCT DOMAIN MODEL ───────────────────────────────────────────────
 * Types, currency helpers and asset resolution. Product records themselves
 * now live in the database and arrive through `catalog.functions.ts`.
 */
import fabricImg from "@/assets/product-fabric.jpg";
import bubuImg from "@/assets/product-bubu.jpg";
import palazzoImg from "@/assets/product-palazzo.jpg";
import asoebiImg from "@/assets/product-asoebi.jpg";
import fabricMacro from "@/assets/detail-fabric-macro.jpg";
import fabricStack from "@/assets/detail-fabric-stack.jpg";
import bubuMacro from "@/assets/detail-bubu-macro.jpg";
import bubuFull from "@/assets/detail-bubu-full.jpg";
import palazzoMacro from "@/assets/detail-palazzo-macro.jpg";
import palazzoStyled from "@/assets/detail-palazzo-styled.jpg";
import asoebiMacro from "@/assets/detail-asoebi-macro.jpg";
import asoebiBulk from "@/assets/detail-asoebi-bulk.jpg";

export type Category = "Fabrics" | "Ready-to-Wear" | "Asoebi";
export type StockStatus = "In Stock" | "Limited Stock" | "Inquire for Timeline";
export type Currency = "NGN" | "GBP";

export interface VolumeTier {
  minQty: number;
  label: string;
  unitPriceNgn: number;
  unitPriceGbp: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: Category;
  variant: string;
  base_price: number;
  price_gbp: number;
  stock_status: StockStatus;
  description: string;
  image: string;
  gallery: { src: string; caption: string }[];
  pattern: string;
  options: string[];
  optionLabel: string;
  minQty: number;
  volumeTiers: VolumeTier[];
  published: boolean;
  sortOrder: number;
}

export const BRAND = {
  name: "Gedhe Couture",
  handle: "Gedhe Couture",
  positioning: "A fashion company creating and curating stylish pieces for the modern woman.",
  whatsapp: "2348032227986",
  whatsappDisplay: "+234 803 222 7986",
} as const;

/** Three verticals, one standard of finish — all owned by Gedhe Couture. */
export const VERTICALS: {
  key: Category;
  label: string;
  blurb: string;
  instagram: string | null;
  handle: string | null;
}[] = [
  {
    key: "Fabrics",
    label: "Ankara Fabrics and ready-to-wear",
    blurb:
      "Ankara fabrics and ready-to-wear — 3-yard cotton wax bundles, cut and finished in-house.",
    instagram: "https://www.instagram.com/theeditco.rtw",
    handle: "theeditco.rtw",
  },
  {
    key: "Ready-to-Wear",
    label: "Curated Thrift & Vintage fashion",
    blurb:
      "Curated thrift and vintage fashion — one-of-one pieces, inspected and steamed before dispatch.",
    instagram: "https://www.instagram.com/theeditco.ng",
    handle: "theeditco.ng",
  },
  {
    key: "Asoebi",
    label: "Affordable Asoebi Bulk Supply",
    blurb:
      "Event coordination specials — volume pricing and timeline planning, arranged on WhatsApp.",
    instagram: null,
    handle: null,
  },
];

/** Delivery fee per currency. */
export const DELIVERY_FEE: Record<Currency, number> = { NGN: 3500, GBP: 18 };

export const CATEGORIES: { key: Category | "All"; label: string; blurb: string }[] = [
  { key: "All", label: "All Pieces", blurb: "The complete Gedhe Couture selection" },
  { key: "Fabrics", label: "ANKARA FABRICS.", blurb: "Ankara fabrics & ready-to-wear" },
  { key: "Ready-to-Wear", label: "THRIFT & VINTAGE", blurb: "Curated thrift & vintage fashion" },
  { key: "Asoebi", label: "Asoebi Bulk Supply", blurb: "Event coordination specials" },
];

/** Bundled house imagery, addressable from database rows as `asset:<file>`. */
const ASSET_MAP: Record<string, string> = {
  "product-fabric.jpg": fabricImg,
  "product-bubu.jpg": bubuImg,
  "product-palazzo.jpg": palazzoImg,
  "product-asoebi.jpg": asoebiImg,
  "detail-fabric-macro.jpg": fabricMacro,
  "detail-fabric-stack.jpg": fabricStack,
  "detail-bubu-macro.jpg": bubuMacro,
  "detail-bubu-full.jpg": bubuFull,
  "detail-palazzo-macro.jpg": palazzoMacro,
  "detail-palazzo-styled.jpg": palazzoStyled,
  "detail-asoebi-macro.jpg": asoebiMacro,
  "detail-asoebi-bulk.jpg": asoebiBulk,
};

export function resolveImage(src: string): string {
  if (src.startsWith("asset:")) return ASSET_MAP[src.slice(6)] ?? "";
  return src;
}

/** Deterministic unit price resolution in a currency, including volume tiers. */
export function priceIn(product: Product, qty: number, currency: Currency): number {
  const base = currency === "NGN" ? product.base_price : product.price_gbp;
  if (product.volumeTiers.length === 0) return base;
  return product.volumeTiers.reduce(
    (price, tier) => (qty >= tier.minQty ? tierPriceIn(tier, currency) : price),
    base,
  );
}

export function tierPriceIn(tier: VolumeTier, currency: Currency): number {
  return currency === "NGN" ? tier.unitPriceNgn : tier.unitPriceGbp;
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
  }).format(amount);
}

/** SKU definition: product code + option token, stable and human readable. */
export function buildSku(product: Product, option: string): string {
  return `${product.code.toUpperCase()}-${option
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 6)
    .toUpperCase()}`;
}

/** Nigeria + wider Africa settle in NGN through Paystack; everyone else in GBP. */
const AFRICA_TIMEZONE_PREFIX = "Africa/";

export function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return tz.startsWith(AFRICA_TIMEZONE_PREFIX) ? "NGN" : "GBP";
  } catch {
    return "NGN";
  }
}
