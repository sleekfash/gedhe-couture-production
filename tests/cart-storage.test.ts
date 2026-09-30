import assert from "node:assert/strict";
import test from "node:test";

import { parseStoredCart, serializeCart, type CartLine } from "../src/lib/cart-storage.ts";

const line: CartLine = {
  key: "product-1::Ochre Bloom",
  productId: "product-1",
  sku: "ANK-001-OCHREB",
  option: "Ochre Bloom",
  qty: 2,
};

test("round-trips valid cart lines", () => {
  assert.deepEqual(parseStoredCart(serializeCart([line])), [line]);
});

test("rejects malformed and unsupported cart payloads", () => {
  assert.deepEqual(parseStoredCart("not-json"), []);
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 2, lines: [line] })), []);
});

test("drops invalid lines instead of breaking cart hydration", () => {
  const invalid = { ...line, key: "invalid", qty: -1 };
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 1, lines: [invalid, line] })), [line]);
});

test("deduplicates saved lines by cart key", () => {
  const updated = { ...line, qty: 4 };
  assert.deepEqual(parseStoredCart(JSON.stringify({ version: 1, lines: [line, updated] })), [
    updated,
  ]);
});
