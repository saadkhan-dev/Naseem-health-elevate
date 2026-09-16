/**
 * Client-side recovery hint for a payment-pending order.
 *
 * The database is always the source of truth for orders and payment state —
 * this hint only helps the patient find their way back to the SAME order after
 * a refresh/navigation so they never create a duplicate. It stores only the
 * non-sensitive order id/number and total. Ownership is re-verified server-side
 * before any order is shown or paid.
 */

const KEY = "health-elevate:pending-order";
const EXPIRE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface PendingOrderHint {
  orderId: string | null;
  orderNo: string | null;
  total: number | null;
  savedAt: number;
}

export function savePendingOrderHint(input: {
  orderId?: string | null;
  orderNo?: string | null;
  total?: number | null;
}): void {
  if (typeof window === "undefined") return;
  if (!input.orderId && !input.orderNo) return;
  try {
    const hint: PendingOrderHint = {
      orderId: input.orderId ?? null,
      orderNo: input.orderNo ?? null,
      total: input.total ?? null,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(hint));
  } catch {
    // best-effort only
  }
}

export function loadPendingOrderHint(): PendingOrderHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrderHint;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.orderId && !parsed.orderNo) return null;
    if (EXPIRE_MS > 0 && Date.now() - (parsed.savedAt ?? 0) > EXPIRE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOrderHint(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
