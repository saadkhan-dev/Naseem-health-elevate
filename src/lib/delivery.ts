/**
 * Pure delivery helpers shared by the storefront, the admin screens and the
 * server-side order functions.
 *
 * This module has NO imports and no database access, so both the client and the
 * server can use the exact same rule when they show/compute a delivery charge —
 * the server is still the single source of truth (it recomputes everything in
 * `placeOrder`), the client only mirrors it for display.
 *
 * Two independent things live here:
 *   1. The store-level delivery charge (global setting + free-delivery
 *      threshold), applied per order and stored separately from the product
 *      subtotal on the order row.
 *   2. The optional per-product estimated delivery time ("3–5 days").
 */

/** Store-level delivery configuration (single row in `store_settings`). */
export interface StoreSettings {
  /** Default delivery fee applied to new orders (Rs.). */
  delivery_charge: number;
  /** Product subtotal at/above which delivery is free (null = no threshold). */
  free_delivery_threshold: number | null;
  /** Master switch. false = no delivery charge is applied at all. */
  delivery_is_active: boolean;
  /** Optional note shown to patients on cart/checkout (e.g. "Within Karachi"). */
  delivery_note: string | null;
}

/**
 * Fallback used when the settings row cannot be read (offline, migration not
 * applied yet). Charge 0 / inactive reproduces the pre-Phase-8 behaviour.
 */
export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  delivery_charge: 0,
  free_delivery_threshold: null,
  delivery_is_active: false,
  delivery_note: null,
};

/** Coerce any (possibly missing/legacy) row into a complete StoreSettings. */
export function normalizeStoreSettings(row: unknown): StoreSettings {
  const r = (row ?? {}) as Partial<Record<keyof StoreSettings, unknown>>;
  const charge = Number(r.delivery_charge);
  const threshold = r.free_delivery_threshold == null ? null : Number(r.free_delivery_threshold);
  return {
    delivery_charge: Number.isFinite(charge) && charge > 0 ? charge : 0,
    free_delivery_threshold:
      threshold != null && Number.isFinite(threshold) && threshold >= 0 ? threshold : null,
    delivery_is_active: r.delivery_is_active === true,
    delivery_note:
      typeof r.delivery_note === "string" && r.delivery_note.trim() ? r.delivery_note.trim() : null,
  };
}

/**
 * The delivery charge actually applied to an order with the given product
 * subtotal. Never negative; 0 when delivery charges are switched off, the
 * configured charge is 0, or the free-delivery threshold is reached.
 */
export interface DeliveryAreaOption {
  id: string;
  name?: string;
  delivery_charge: number;
  free_delivery_threshold: number | null;
  is_active: boolean;
  delivery_note?: string | null;
}

export interface ResolveDeliveryChargeOptions {
  /** Priority 1: Per-order override explicitly set by admin. */
  override?: number | null;
  /** Available delivery areas configured by clinic. */
  areas?: DeliveryAreaOption[] | null;
  /** Delivery area selected at checkout by the patient. */
  selectedAreaId?: string | null;
}

/**
 * Priority delivery charge calculator.
 *
 * Priority order:
 *   1. Per-order delivery override (if explicitly set, e.g. admin adjusted order)
 *   2. Selected delivery area's charge (if an active area is selected)
 *      - Area-specific free-delivery threshold overrides global threshold if set
 *      - Otherwise global free-delivery threshold applies
 *   3. Global / default delivery charge (from store_settings)
 *      - Global free-delivery threshold applies
 *   4. Rs. 0 if delivery charges are disabled (delivery_is_active === false)
 *      (or if configured charge is <= 0 or subtotal reaches applicable free threshold).
 */
export function resolveDeliveryCharge(
  settings: Pick<
    StoreSettings,
    "delivery_charge" | "free_delivery_threshold" | "delivery_is_active"
  >,
  subtotal: number,
  optionsOrAreas?: ResolveDeliveryChargeOptions | DeliveryAreaOption[] | null,
  legacyAreaId?: string | null,
): number {
  let override: number | null = null;
  let areas: DeliveryAreaOption[] | null = null;
  let selectedAreaId: string | null = null;

  if (Array.isArray(optionsOrAreas)) {
    areas = optionsOrAreas;
    selectedAreaId = legacyAreaId ?? null;
  } else if (optionsOrAreas && typeof optionsOrAreas === "object") {
    override = optionsOrAreas.override ?? null;
    areas = optionsOrAreas.areas ?? null;
    selectedAreaId = optionsOrAreas.selectedAreaId ?? null;
  }

  // Priority 1: Explicit per-order override (admin adjustment)
  if (override != null && Number.isFinite(override) && override >= 0) {
    return Math.max(0, override);
  }

  // Priority 4: Delivery charges disabled globally
  if (!settings.delivery_is_active) {
    return 0;
  }

  // Priority 2: Selected delivery area's charge
  if (selectedAreaId && areas && areas.length > 0) {
    const area = areas.find((a) => a.id === selectedAreaId && a.is_active !== false);
    if (area) {
      const areaCharge = Math.max(0, Number(area.delivery_charge) || 0);
      if (areaCharge <= 0) return 0;

      // Area-level free-delivery threshold override
      if (area.free_delivery_threshold != null && Number.isFinite(area.free_delivery_threshold)) {
        if (subtotal >= area.free_delivery_threshold) return 0;
        return areaCharge;
      }

      // Fall back to global free-delivery threshold if area has no specific threshold
      if (
        settings.free_delivery_threshold != null &&
        Number.isFinite(settings.free_delivery_threshold) &&
        subtotal >= settings.free_delivery_threshold
      ) {
        return 0;
      }

      return areaCharge;
    }
  }

  // Priority 3: Global / default delivery charge
  const globalCharge = Math.max(0, Number(settings.delivery_charge) || 0);
  if (globalCharge <= 0) return 0;

  if (
    settings.free_delivery_threshold != null &&
    Number.isFinite(settings.free_delivery_threshold) &&
    subtotal >= settings.free_delivery_threshold
  ) {
    return 0;
  }

  return globalCharge;
}

/** Product subtotal + delivery charge (the amount the patient pays). */
export function grandTotal(
  settings: Pick<
    StoreSettings,
    "delivery_charge" | "free_delivery_threshold" | "delivery_is_active"
  >,
  subtotal: number,
  optionsOrAreas?: ResolveDeliveryChargeOptions | DeliveryAreaOption[] | null,
  legacyAreaId?: string | null,
): number {
  return subtotal + resolveDeliveryCharge(settings, subtotal, optionsOrAreas, legacyAreaId);
}

// ---------------------------------------------------------------------------
// Product estimated delivery time (optional, admin controlled)
// ---------------------------------------------------------------------------

/** Predefined estimates offered in the admin product form ("Custom" is free text). */
export const DELIVERY_ESTIMATE_OPTIONS = ["2–3 days", "3–5 days", "5–7 days"] as const;

/** Safe display helper — legacy/blank values render as nothing at all. */
export function productDeliveryEstimate(product: {
  delivery_estimate?: string | null;
}): string | null {
  const value = product.delivery_estimate?.trim();
  return value ? value : null;
}

/** "Rs. 200" or "Free" — how the applied delivery charge is displayed. */
export function deliveryChargeLabel(charge: number): string {
  return charge > 0 ? `Rs. ${charge.toLocaleString()}` : "Free";
}

/** "Delivery: 3–5 days" (null when the product has no estimate). */
export function productDeliveryLabel(product: {
  delivery_estimate?: string | null;
}): string | null {
  const estimate = productDeliveryEstimate(product);
  return estimate ? `Delivery: ${estimate}` : null;
}
