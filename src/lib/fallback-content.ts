/**
 * ---------------------------------------------------------------------------
 * PRODUCTION CONTENT SNAPSHOT — rahathomeophysioclinic.com
 * ---------------------------------------------------------------------------
 * Extracted directly from the live Supabase database (2026-08-24) so the
 * website always has real clinic content to show, even before a Supabase
 * project is connected in `.env` (or if the database is briefly unreachable /
 * a table is still empty).
 *
 * Every public getter (`getConditions`, `getReviews`, `getServices`,
 * `getPublicVideoOffers`, `getDoctorProfile`) falls back to this data when the
 * database returns nothing. Once a real Supabase project is connected and
 * seeded (`supabase/seed-*.sql`), the live database wins automatically.
 *
 * NOTE: entries marked "cleaned" were quick notes typed in the admin panel on
 * the live site (lowercase / typos); titles + descriptions here are the same
 * items rewritten professionally. IDs match the live database rows exactly.
 */

import type { Condition, ConditionCategory, Review } from "./site-content";
import type { Service } from "./bookings";
import type { VideoOffer } from "./video-offer-types";
import type { DoctorProfile } from "./site-extra";

const SEED_TS = "2026-08-09T13:41:43.599007+00:00";

export const FALLBACK_CONDITIONS: Condition[] = [
  // ------------------------- Homeopathy -------------------------
  {
    id: "47036914-8d09-4dc7-85d5-a251b264ba4e",
    category: "homeopathic",
    title: "Skin Conditions",
    description: "Personalized assessment and homeopathic care for common skin-related concerns.",
    sort_order: 1,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "6f2aafcb-ffba-4614-b07c-898471d8a345",
    category: "homeopathic",
    title: "Stress & Anxiety",
    description:
      "Personalized consultation for stress, anxiety and related everyday health concerns.",
    sort_order: 2,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "e72c48bc-111a-4435-8501-1a5f5289a87a",
    category: "homeopathic",
    title: "Respiratory Conditions",
    description:
      "Individualized homeopathic guidance for common respiratory and seasonal complaints.",
    sort_order: 3,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "777c25f7-083e-4506-b8a3-3fabf705eae3",
    category: "homeopathic",
    title: "Headache & Migraine",
    description: "Care focused on understanding recurring headaches and migraine-related symptoms.",
    sort_order: 4,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "be47cc3e-99f3-424e-9ec8-e5a95191a8dd",
    category: "homeopathic",
    title: "General Health Concerns",
    description: "Consultation and individualized guidance based on your overall health needs.",
    sort_order: 5,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    // live row title "motions" (description: "weakness") — cleaned
    id: "018c09a1-3405-49e3-9b98-62a223be3f70",
    category: "homeopathic",
    title: "Loose Motions & Weakness",
    description:
      "Gentle homeopathic support for loose motions, digestive upset and the weakness that follows.",
    sort_order: 6,
    is_active: true,
    created_at: "2026-08-10T21:32:19.841252+00:00",
  },
  {
    // live row title "typhoid" — cleaned
    id: "871af3f0-fdf1-4396-8d33-17cb792ac835",
    category: "homeopathic",
    title: "Typhoid Fever & Recovery",
    description:
      "Individualized homeopathic care during and after typhoid to support recovery and regained strength.",
    sort_order: 7,
    is_active: true,
    created_at: "2026-08-10T21:34:33.152689+00:00",
  },
  {
    // live row title "maleria" (description: "fever type") — cleaned
    id: "b06a2130-d005-4739-b7f4-5a9f9809dc78",
    category: "homeopathic",
    title: "Malaria & Fever Types",
    description:
      "Supportive homeopathic care for malaria-type fevers, chills and post-fever fatigue.",
    sort_order: 8,
    is_active: true,
    created_at: "2026-08-10T21:34:50.704252+00:00",
  },
  {
    // live row title "fever" — cleaned
    id: "8a91fb88-caff-4da4-98b7-7e440fa245b4",
    category: "homeopathic",
    title: "Fever & Flu",
    description: "Individualized homeopathic guidance for common fevers and flu-like symptoms.",
    sort_order: 9,
    is_active: true,
    created_at: "2026-08-10T21:35:01.107056+00:00",
  },
  // ------------------------ Physiotherapy -------------------------
  {
    id: "be130ef2-4800-4fd0-8584-4118c1190a99",
    category: "physiotherapy",
    title: "Back & Neck Pain",
    description:
      "Physiotherapy support to improve mobility, manage discomfort and restore daily function.",
    sort_order: 1,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "ceeda9c2-cae6-4707-90b1-aa4f2641a8dd",
    category: "physiotherapy",
    title: "Joint Pain",
    description: "Targeted physiotherapy care for movement, flexibility and joint function.",
    sort_order: 2,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "027f6cdf-58bd-43f3-9ffd-5e9028bcc520",
    category: "physiotherapy",
    title: "Muscle & Sports Injuries",
    description: "Rehabilitation support to help improve strength, movement and physical recovery.",
    sort_order: 3,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "abb69117-ec7b-4ce3-9e5e-676dbcd54293",
    category: "physiotherapy",
    title: "Arthritis & Mobility",
    description:
      "Exercise-based physiotherapy support for mobility, flexibility and everyday movement.",
    sort_order: 4,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "30b44e05-8775-4938-a5bb-7f4786ac2e63",
    category: "physiotherapy",
    title: "Post-Injury Rehabilitation",
    description:
      "Structured rehabilitation to support a safe return to normal movement and activities.",
    sort_order: 5,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    id: "19b40591-eaef-49bb-81b7-51136976ce80",
    category: "physiotherapy",
    title: "Movement & Posture Problems",
    description:
      "Professional guidance to improve posture, movement patterns and physical function.",
    sort_order: 6,
    is_active: true,
    created_at: SEED_TS,
  },
  {
    // live row title "ms" (category: physiotherapy) — read as MS neuro rehab
    id: "bd596040-31de-4be3-8c84-c90315777246",
    category: "physiotherapy",
    title: "Multiple Sclerosis (MS) Rehab",
    description:
      "Physiotherapy support focused on mobility, balance and strength for people living with multiple sclerosis.",
    sort_order: 7,
    is_active: true,
    created_at: "2026-08-10T21:37:42.512035+00:00",
  },
];

/** The 4 real bookable services configured on the live site. */
export const FALLBACK_SERVICES: Service[] = [
  {
    id: "d1e16d5c-3b3e-4a01-8318-ee405399b15e",
    name: "Homeopathic Consultation",
    description: "Complete homeopathic assessment and treatment plan",
    duration_minutes: 15,
    price: 0,
    is_active: true,
  },
  {
    id: "8e71c64c-9cbe-4947-b73a-3db868ee4012",
    name: "Physiotherapy Session",
    description: "One-on-one physiotherapy session",
    duration_minutes: 35,
    price: 0,
    is_active: true,
  },
  {
    id: "13a557a5-468f-406d-bacf-0ac3390875b2",
    name: "Online Video Consultation",
    description: "Remote consultation via video call",
    duration_minutes: 15,
    price: 500,
    is_active: true,
  },
  {
    id: "d34699d5-40e0-4d1a-9e13-2e4657f2e9d8",
    name: "Home Visit",
    description:
      "In-home consultation with Dr. Naseem Ahmed Khan. The fee is flexible and depends on time and distance.",
    duration_minutes: null,
    price: 0,
    is_active: true,
  },
];

/** All 7 approved reviews currently shown on the live site (newest first). */
export const FALLBACK_REVIEWS: Review[] = [
  {
    id: "b5ef872c-9700-4651-81d4-e28359d7f083",
    name: "ggo",
    rating: 5,
    text: "ok",
    is_active: true,
    status: "approved",
    patient_id: "5848aa25-cdef-4620-85e0-a9dfc039e0f8",
    created_at: "2026-08-13T16:38:00.347725+00:00",
  },
  {
    id: "e5904f20-3445-46ed-8c54-bf9d9abdd697",
    name: "naseem",
    rating: 5,
    text: "nice",
    is_active: true,
    status: "approved",
    patient_id: "5848aa25-cdef-4620-85e0-a9dfc039e0f8",
    created_at: "2026-08-13T16:24:15.145683+00:00",
  },
  {
    id: "cdc740bb-797d-4c00-8c0d-0b1dcceb2f13",
    name: "naseem",
    rating: 5,
    text: "nice",
    is_active: true,
    status: "approved",
    patient_id: "5848aa25-cdef-4620-85e0-a9dfc039e0f8",
    created_at: "2026-08-13T16:22:42.858443+00:00",
  },
  {
    id: "4c83942d-99ca-46c8-87ce-c94ccfb920c3",
    name: "Test User",
    rating: 5,
    text: "ok",
    is_active: true,
    status: "approved",
    patient_id: null,
    created_at: "2026-08-13T16:23:10.548709+00:00",
  },
  {
    id: "664751ab-0acb-4a74-aff1-5f2c4c8c1e8a",
    name: "Google Reviewer",
    rating: 5,
    text: "Professional and caring service with a comfortable and welcoming environment.",
    is_active: true,
    status: "approved",
    patient_id: null,
    created_at: SEED_TS,
  },
  {
    id: "037389bb-83f5-4cf7-b1b1-a7a2b1212d4d",
    name: "Google Reviewer",
    rating: 5,
    text: "Very good experience with the treatment and professional guidance.",
    is_active: true,
    status: "approved",
    patient_id: null,
    created_at: SEED_TS,
  },
  {
    id: "63ad4c66-5cea-4831-99d3-28152a846fdf",
    name: "Google Reviewer",
    rating: 5,
    text: "A positive experience with attentive care and proper guidance.",
    is_active: true,
    status: "approved",
    patient_id: null,
    created_at: SEED_TS,
  },
];

/** Single-row about/credentials record managed from Admin → Doctor Profile. */
export const FALLBACK_DOCTOR_PROFILE: DoctorProfile = {
  id: 1,
  full_name: "Dr. Naseem Ahmed Khan",
  title: "Homeopath & Physiotherapist",
  tagline: "Natural, patient-centred healthcare for the whole family.",
  bio: "",
  credentials: "",
  education: "D.H.M.S., R.H.M.P.",
  experience_years: 20,
  languages: "Urdu, English",
  specialties: "Homeopathy, Physiotherapy",
  photo_url: null,
  phone: "03152968384",
  email: "rahatphysio9@gmail.com",
  address: "R 125 sector 11c2. North karachi",
  social_links: {},
  is_active: true,
  updated_at: "2026-08-16T21:15:41.978+00:00",
};

/** Active campaign on the live site: 40% off video consultations. */
export const FALLBACK_VIDEO_OFFERS: VideoOffer[] = [
  {
    id: "e97e187f-f596-46dc-b706-2f533a2ddc56",
    title: "3-Month Video Consultation Special – 40% Off",
    description: "Get 40% off on video consultations for 3 months.",
    offer_type: "percent",
    discount_percent: 40,
    discount_amount: null,
    start_date: "2026-08-13",
    end_date: "2026-11-20",
    is_active: true,
    eligibility: "all",
    terms: null,
  },
];

/** Convenience helper used by the public getters. */
export function fallbackConditionsFor(category: ConditionCategory): Condition[] {
  return FALLBACK_CONDITIONS.filter((c) => c.category === category);
}
