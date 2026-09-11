import { supabase } from "@/lib/supabase";
import { todayInClinic } from "@/lib/clinic";
import { isOfferVisible, type VideoOffer } from "@/lib/video-offer-types";
import { FALLBACK_VIDEO_OFFERS } from "@/lib/fallback-content";

/**
 * Offers shown on the public Video Consultation section (homepage card +
 * booking page). This is the DISPLAY rule — it includes upcoming offers whose
 * start date is still in the future, but excludes expired/inactive ones.
 *
 * `video_offers` has a public RLS SELECT policy, so the anon client can read
 * it directly (same pattern as `getServices`/`getAvailability`). The actual
 * discount is applied separately by `resolveVideoOffer` only once an offer's
 * start date has been reached.
 */
export async function getPublicVideoOffers(): Promise<VideoOffer[]> {
  const today = todayInClinic();
  try {
    const { data, error } = await supabase
      .from("video_offers")
      .select("*")
      .eq("is_active", true)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return ((data ?? []) as VideoOffer[]).filter((o) => isOfferVisible(o, today));
    }
  } catch {
    // ignore — fall through to snapshot below
  }

  // Database not connected / no active offers → show the live site's current
  // campaign so the offer card never disappears.
  return FALLBACK_VIDEO_OFFERS.filter((o) => isOfferVisible(o, today));
}
