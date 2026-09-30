/** Versioned, defensive browser persistence for cart lines. */

export interface CartLine {
  key: string;
  productId: string;
  sku: string;
  option: string;
  qty: number;
}

export const CART_STORAGE_KEY = "gedhe-couture.cart.v1";

interface StoredCart {
  version: 1;
  lines: CartLine[];
}

const MAX_PERSISTED_QUANTITY = 10_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Record<string, unknown>;

  return (
    isNonEmptyString(line["key"]) &&
    isNonEmptyString(line["productId"]) &&
    isNonEmptyString(line["sku"]) &&
    isNonEmptyString(line["option"]) &&
    Number.isInteger(line["qty"]) &&
    Number(line["qty"]) > 0 &&
    Number(line["qty"]) <= MAX_PERSISTED_QUANTITY
  );
}

export function parseStoredCart(value: string | null): CartLine[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Partial<StoredCart>;
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) return [];

    const uniqueLines = new Map<string, CartLine>();
    for (const candidate of parsed.lines) {
      if (isCartLine(candidate)) uniqueLines.set(candidate.key, candidate);
    }
    return [...uniqueLines.values()];
  } catch {
    return [];
  }
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify({ version: 1, lines } satisfies StoredCart);
}
