/**
 * Pure, client-safe product offer types + price math. Imported by the server
 * order handlers (authoritative pricing), the shop/cart/checkout surfaces and
 * the admin product editor. No Supabase/server imports here.
 *
 * Per-product offers are much simpler than the video-consultation offer system:
 * a product either has an active offer (products.offer_is_active) within an
 * optional date window (offer_start_date / offer_end_date, both inclusive) that
 * discounts the original price (products.price) down to products.discount_price.
 *
 * The admin can enter either a discounted price (discount_price) or a discount
 * percentage (offer_percent); the effective price is always discount_price when
 * the offer is active, otherwise price.
 */

export interface ProductOfferFields {
  price: number;
  discount_price: number | null;
  offer_is_active: boolean;
  offer_title: string | null;
  offer_start_date: string | null;
  offer_end_date: string | null;
  offer_percent: number | null;
}

/**
 * True when the offer should currently discount the price: the master switch is
 * on, a discounted price exists, and today is within the optional date window
 * (both dates inclusive; a missing date means unbounded on that side).
 *
 * `today` is the clinic-local date ("yyyy-MM-dd", see `@/lib/clinic`).
 */
export function isProductOfferActive(
  product: Pick<
    ProductOfferFields,
    "offer_is_active" | "discount_price" | "offer_start_date" | "offer_end_date"
  >,
  today: string,
): boolean {
  if (!product.offer_is_active || product.discount_price == null) return false;
  if (product.offer_start_date && product.offer_start_date > today) return false;
  if (product.offer_end_date && product.offer_end_date < today) return false;
  return true;
}

/**
 * The price the customer actually pays: the discounted price while the offer is
 * active, otherwise the original price.
 */
export function productEffectivePrice(
  product: Pick<
    ProductOfferFields,
    "price" | "discount_price" | "offer_is_active" | "offer_start_date" | "offer_end_date"
  >,
  today: string,
): number {
  return isProductOfferActive(product, today)
    ? Number(product.discount_price)
    : Number(product.price);
}

/**
 * The discount percentage for display ("20% OFF"). Prefers the admin-entered
 * percentage, otherwise derives it from the original/discounted prices.
 */
export function productDiscountPercent(
  product: Pick<ProductOfferFields, "price" | "discount_price">,
): number | null {
  if (product.discount_price == null) return null;
  const price = Number(product.price);
  const discounted = Number(product.discount_price);
  if (price <= 0 || discounted >= price) return null;
  return Math.round(((price - discounted) / price) * 100);
}

/** A short offer label for badges: the title if set, else "X% OFF". */
export function productOfferLabel(product: ProductOfferFields): string | null {
  if (!product.offer_is_active || product.discount_price == null) return null;
  const percent = productDiscountPercent(product);
  return product.offer_title?.trim() || (percent != null ? `${percent}% OFF` : "Sale") || null;
}
