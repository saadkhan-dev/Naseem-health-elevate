import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOfferAmount, isOfferVisible, type VideoOffer } from "@/lib/video-offer-types";
import { todayInClinic } from "@/lib/clinic";

/**
 * Server-side Video Consultation offer resolution.
 *
 * Lives outside the TanStack server functions (`actions.functions.ts`) so the
 * e2e tests can exercise the exact same logic directly against the live DB
 * (the framework wrapper can't be invoked from bun) — the same pattern as
 * `server/video-payments.ts` and `server/recover-appointments.ts`.
 *
 * An offer is a price adjustment applied at booking time on the video
 * consultation service:
 *   - "waive"   → the consultation is free (amount 0)
 *   - "percent" → discount_percent% off the service price
 *   - "fixed"   → a flat Rs. discount_amount off the service price
 *
 * The resolved amount is snapshotted onto the appointment row
 * (`payment_amount`) at booking time so the displayed fee never changes even
 * if the offer or the service price is later edited.
 */

export type { VideoOffer, VideoOfferType, VideoOfferEligibility } from "@/lib/video-offer-types";
export { computeOfferAmount, isOfferVisible, isOfferActive } from "@/lib/video-offer-types";

export interface OfferDecision {
  /** The price the patient is actually charged (Rs., >= 0). */
  amount: number;
  /** The offer applied, or null when the full price is charged. */
  offer_id: string | null;
  /** Human-readable offer title (for the confirmation/payment UI). */
  offer_title: string | null;
}

/**
 * True when this patient (by phone OR email) has already used any video offer
 * — used to gate "new_patients" eligibility.
 */
export async function hasUsedAnyOffer(
  admin: SupabaseClient,
  phone: string | null,
  email: string | null,
): Promise<boolean> {
  if (!phone && !email) return false;

  const filters: string[] = [];
  if (phone) filters.push(`patient_phone.eq.${phone}`);
  if (email) filters.push(`patient_email.eq.${email}`);

  const { data } = await admin
    .from("video_offer_usage")
    .select("id")
    .limit(1)
    .or(filters.join(","));

  return (data?.length ?? 0) > 0;
}

/**
 * Pick the best applicable offer for a video consultation booking.
 *
 * Offers are tried newest-first; the first offer that is active, in its
 * validity window and passes its eligibility check wins. A "new_patients"
 * offer is skipped when the patient already used an offer before, but a
 * later (older) offer that is open to everyone can still apply.
 *
 * This is the PRICE rule: only offers whose start date has been reached are
 * considered (upcoming offers never discount the fee). The end date is
 * inclusive — an offer stays active for the whole of its end date.
 */
export async function resolveVideoOffer(
  admin: SupabaseClient,
  params: {
    servicePrice: number;
    phone: string | null;
    email: string | null;
    patientName: string;
  },
): Promise<OfferDecision> {
  const today = todayInClinic();

  const { data: offers, error } = await admin
    .from("video_offers")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error || !offers || offers.length === 0) {
    return { amount: params.servicePrice, offer_id: null, offer_title: null };
  }

  for (const offer of offers as unknown as VideoOffer[]) {
    if (offer.eligibility === "new_patients") {
      const used = await hasUsedAnyOffer(admin, params.phone, params.email);
      if (used) continue;
    }

    const amount = computeOfferAmount(offer, params.servicePrice);
    return { amount, offer_id: offer.id, offer_title: offer.title };
  }

  return { amount: params.servicePrice, offer_id: null, offer_title: null };
}

/**
 * All offers that should be DISPLAYED on the public website — active offers
 * AND upcoming ones whose start date is still in the future. Expired offers
 * and offers the admin deactivated are excluded. The end date is inclusive.
 *
 * Distinct from `resolveVideoOffer` (the PRICE rule): a returned upcoming
 * offer must NOT be discounted until its start date arrives.
 */
export async function getVisibleVideoOffers(
  admin: SupabaseClient,
  today: string = todayInClinic(),
): Promise<VideoOffer[]> {
  const { data, error } = await admin
    .from("video_offers")
    .select("*")
    .eq("is_active", true)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as VideoOffer[]).filter((o) => isOfferVisible(o, today));
}

/**
 * Record that an appointment consumed an offer. Called at booking time when
 * an offer was applied, so offer usage is tracked even if the payment is
 * still pending.
 */
export async function recordOfferUsage(
  admin: SupabaseClient,
  params: {
    offer_id: string;
    appointment_id: string;
    patientName: string;
    phone: string | null;
    email: string | null;
  },
): Promise<{ error: string | null }> {
  const { error } = await admin.from("video_offer_usage").insert({
    offer_id: params.offer_id,
    appointment_id: params.appointment_id,
    patient_name: params.patientName,
    patient_phone: params.phone,
    patient_email: params.email,
  });
  return { error: error?.message ?? null };
}

/** Remove the usage record for an appointment (cancel/reject frees the offer). */
export async function releaseOfferUsage(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("video_offer_usage")
    .delete()
    .eq("appointment_id", appointmentId);
  return { error: error?.message ?? null };
}
