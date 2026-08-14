/**
 * Pure, client-safe video offer types + price math. Imported by both the
 * server resolver (`src/lib/server/video-offers.ts`) and the admin UI
 * (preview). No Supabase/server imports here.
 */

export type VideoOfferType = "waive" | "percent" | "fixed";
export type VideoOfferEligibility = "all" | "new_patients";

export interface VideoOffer {
  id: string;
  title: string;
  description: string | null;
  offer_type: VideoOfferType;
  discount_percent: number | null;
  discount_amount: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  eligibility: VideoOfferEligibility;
  terms: string | null;
}

/**
 * Two separate concepts are intentionally kept apart:
 *
 *   A) DISPLAY — "should this offer be shown on the public website?"
 *      Any active, not-yet-expired offer is shown, INCLUDING upcoming ones
 *      whose start date is still in the future.
 *
 *   B) PRICE — "should this offer currently discount the consultation fee?"
 *      Only once the start date is reached (and until the end date,
 *      which is INCLUSIVE) does the offer affect the price.
 *
 * `today` is the clinic-local date ("yyyy-MM-dd", see `@/lib/clinic`).
 */

/** A) DISPLAY: active and not expired (end date inclusive). Upcoming offers qualify. */
export function isOfferVisible(
  offer: Pick<VideoOffer, "is_active" | "end_date">,
  today: string,
): boolean {
  return offer.is_active && (offer.end_date === null || offer.end_date >= today);
}

/** B) PRICE: visible AND the start date has been reached. End date is inclusive. */
export function isOfferActive(
  offer: Pick<VideoOffer, "is_active" | "start_date" | "end_date">,
  today: string,
): boolean {
  return isOfferVisible(offer, today) && offer.start_date <= today;
}

/**
 * The discounted/waived price for an offer, given the full service price.
 * - waive   → 0 (consultation free)
 * - percent → price * (100 - discount_percent) / 100
 * - fixed   → max(0, price - discount_amount)
 */
export function computeOfferAmount(
  offer: Pick<VideoOffer, "offer_type" | "discount_percent" | "discount_amount">,
  servicePrice: number,
): number {
  if (offer.offer_type === "waive") return 0;
  if (offer.offer_type === "percent") {
    const pct = Math.min(100, Math.max(0, offer.discount_percent ?? 0));
    return Math.max(0, Math.round((servicePrice * (100 - pct)) / 100));
  }
  if (offer.offer_type === "fixed") {
    return Math.max(0, Math.round(servicePrice - (offer.discount_amount ?? 0)));
  }
  return servicePrice;
}
