import { supabase } from "@/lib/supabase";
import { todayInClinic } from "@/lib/clinic";
import { isOfferVisible, type VideoOffer } from "@/lib/video-offer-types";

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
  const { data } = await supabase
    .from("video_offers")
    .select("*")
    .eq("is_active", true)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("created_at", { ascending: false });

  return ((data ?? []) as VideoOffer[]).filter((o) => isOfferVisible(o, today));
}
