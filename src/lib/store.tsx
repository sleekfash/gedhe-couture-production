/**
 * ── CENTRALIZED TRANSACTIONAL STATE ───────────────────────────────────
 * Single source of truth for the catalog filter, selected currency, cart
 * lines and the slide-out checkout panel. UI components stay presentational.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  buildSku,
  detectCurrency,
  formatMoney,
  priceIn,
  type Category,
  type Currency,
  type Product,
} from "@/data/catalog";

export interface CartLine {
  key: string;
  productId: string;
  sku: string;
  option: string;
  qty: number;
}

export interface PricedLine extends CartLine {
  product: Product;
  unitPrice: number;
  lineTotal: number;
}

type Filter = Category | "All";

interface StoreValue {
  products: Product[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  visibleProducts: Product[];
  currency: Currency;
  setCurrency: (c: Currency) => void;
  money: (amount: number) => string;
  lines: PricedLine[];
  volume: number;
  subtotal: number;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addLine: (product: Product, option: string, qty: number) => void;
  updateQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  products,
}: {
  children: ReactNode;
  products?: Product[];
}) {
  const catalog = useMemo(() => products ?? [], [products]);
  const [filter, setFilter] = useState<Filter>("All");
  const [rawLines, setRawLines] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>("NGN");

  // Region-aware default, resolved after hydration to avoid SSR mismatches.
  useEffect(() => {
    setCurrency(detectCurrency());
  }, []);

  const visibleProducts = useMemo(
    () => (filter === "All" ? catalog : catalog.filter((p) => p.category === filter)),
    [filter, catalog],
  );

  const lines = useMemo<PricedLine[]>(
    () =>
      rawLines.flatMap((line) => {
        const product = catalog.find((p) => p.id === line.productId);
        if (!product) return [];
        const unitPrice = priceIn(product, line.qty, currency);
        return [{ ...line, product, unitPrice, lineTotal: unitPrice * line.qty }];
      }),
    [rawLines, catalog, currency],
  );

  const volume = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);

  const addLine = useCallback((product: Product, option: string, qty: number) => {
    const key = `${product.id}::${option}`;
    setRawLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { key, productId: product.id, sku: buildSku(product, option), option, qty }];
    });
  }, []);

  const updateQty = useCallback(
    (key: string, qty: number) => {
      setRawLines((prev) =>
        prev.flatMap((l) => {
          if (l.key !== key) return [l];
          const product = catalog.find((p) => p.id === l.productId);
          const floor = product?.minQty ?? 1;
          if (qty < floor) return [];
          return [{ ...l, qty }];
        }),
      );
    },
    [catalog],
  );

  const removeLine = useCallback(
    (key: string) => setRawLines((prev) => prev.filter((l) => l.key !== key)),
    [],
  );

  const value: StoreValue = {
    products: catalog,
    filter,
    setFilter,
    visibleProducts,
    currency,
    setCurrency,
    money: (amount: number) => formatMoney(amount, currency),
    lines,
    volume,
    subtotal,
    cartOpen,
    openCart: () => setCartOpen(true),
    closeCart: () => setCartOpen(false),
    addLine,
    updateQty,
    removeLine,
    clearCart: () => setRawLines([]),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
