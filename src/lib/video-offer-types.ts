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
