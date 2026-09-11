import { useEffect, useState } from "react";

/**
 * Lightweight client-side shopping cart.
 *
 * Stored in localStorage so it works for guests AND signed-in patients
 * (placing an order doesn't require an account). The cart is validated against
 * the live catalog (prices/stock) at checkout time by the `placeOrder` server
 * function — this store only remembers product IDs + quantities.
 */

export interface CartItem {
  productId: string;
  quantity: number;
}

const CART_KEY = "health-elevate:cart";
const MAX_ITEMS = 50;

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is CartItem =>
          !!i &&
          typeof i === "object" &&
          typeof (i as CartItem).productId === "string" &&
          typeof (i as CartItem).quantity === "number",
      )
      .map((i) => ({ productId: i.productId, quantity: Math.min(i.quantity, MAX_ITEMS) }));
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // Storage may be unavailable (private mode); the in-memory cart still works.
  }
}

export function getCart(): CartItem[] {
  return readCart();
}

export function addToCart(productId: string, quantity = 1): CartItem[] {
  const items = readCart();
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, MAX_ITEMS);
  } else {
    items.push({ productId, quantity: Math.min(quantity, MAX_ITEMS) });
  }
  writeCart(items);
  return items;
}

export function updateCartQuantity(productId: string, quantity: number): CartItem[] {
  const items = readCart();
  const existing = items.find((i) => i.productId === productId);
  if (!existing) return items;
  if (quantity <= 0) return removeFromCart(productId);
  existing.quantity = Math.min(quantity, MAX_ITEMS);
  writeCart(items);
  return items;
}

export function removeFromCart(productId: string): CartItem[] {
  const items = readCart().filter((i) => i.productId !== productId);
  writeCart(items);
  return items;
}

export function clearCart(): CartItem[] {
  writeCart([]);
  return [];
}

/**
 * Reactive cart hook. Any mutation returns the fresh items and bumps a version
 * so every subscriber re-renders (e.g. the navbar badge + cart page together).
 */
export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => readCart());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const sync = () => setItems(readCart());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const commit = (next: CartItem[]) => {
    setItems(next);
    setVersion((v) => v + 1);
  };

  return {
    items,
    version,
    count: items.reduce((sum, i) => sum + i.quantity, 0),
    add: (productId: string, quantity = 1) => commit(addToCart(productId, quantity)),
    updateQuantity: (productId: string, quantity: number) =>
      commit(updateCartQuantity(productId, quantity)),
    remove: (productId: string) => commit(removeFromCart(productId)),
    clear: () => commit(clearCart()),
  };
}
