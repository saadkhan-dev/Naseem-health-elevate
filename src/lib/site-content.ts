import { supabase, staffSupabase } from "@/lib/supabase";
import { fallbackConditionsFor, FALLBACK_REVIEWS } from "./fallback-content";
import {
  adminCreateCondition,
  adminUpdateCondition,
  adminDeleteCondition,
  adminCreateReview,
  adminUpdateReview,
  adminDeleteReview,
} from "@/lib/actions.functions";

export type ConditionCategory = "homeopathic" | "physiotherapy";

export interface Condition {
  id: string;
  category: ConditionCategory;
  title: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  text: string;
  is_active: boolean;
  status?: "pending" | "approved" | "rejected";
  patient_id?: string | null;
  created_at: string;
}

// --- Public ---

/**
 * Reads conditions from Supabase. When the database is unreachable, not yet
 * connected, or simply has no active rows yet, we fall back to the production
 * content snapshot so the "Diseases & Symptoms" section is never empty.
 */
export async function getConditions(category: ConditionCategory): Promise<Condition[]> {
  try {
    const { data, error } = await supabase
      .from("conditions")
      .select("*")
      .eq("category", category)
      .eq("is_active", true)
      .order("sort_order");
    if (!error && data && data.length > 0) return data;
  } catch {
    // ignore — fall through to snapshot below
  }
  return fallbackConditionsFor(category);
}

/**
 * Same idea as getConditions: approved reviews from the database when
 * available, otherwise the approved reviews currently shown on the live site.
 */
export async function getReviews(): Promise<Review[]> {
  try {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("is_active", true)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (!error && data && data.length > 0) return data;
  } catch {
    // ignore — fall through to snapshot below
  }
  return FALLBACK_REVIEWS;
}

// --- Admin: Conditions ---

export async function getAllConditions(): Promise<Condition[]> {
  const { data } = await supabase
    .from("conditions")
    .select("*")
    .order("category")
    .order("sort_order");
  return data ?? [];
}

export async function createCondition(data: {
  category: ConditionCategory;
  title: string;
  description: string;
  sort_order?: number;
  is_active?: boolean;
}) {
  return adminCreateCondition({ data });
}

export async function updateCondition(
  id: string,
  data: {
    category?: ConditionCategory;
    title?: string;
    description?: string;
    sort_order?: number;
    is_active?: boolean;
  },
) {
  return adminUpdateCondition({ data: { id, data } });
}

export async function deleteCondition(id: string) {
  return adminDeleteCondition({ data: { id } });
}

// Admin: Reviews
//
// Reads through the STAFF-authenticated client (not the public one). The public
// client has no staff session, so the anon RLS policy would only return
// approved+live rows — pending patient submissions (and rejected ones) would
// never reach the moderation dashboard. The staff client satisfies the
// `reviews_read_all_admin` policy (`is_admin()`), so every row shows up.
export async function getAllReviews(): Promise<Review[]> {
  const { data } = await staffSupabase
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createReview(data: {
  name: string;
  rating: number;
  text: string;
  is_active?: boolean;
}) {
  return adminCreateReview({ data });
}

export async function updateReview(
  id: string,
  data: {
    name?: string;
    rating?: number;
    text?: string;
    is_active?: boolean;
    status?: "pending" | "approved" | "rejected";
  },
) {
  return adminUpdateReview({ data: { id, data } });
}

export async function deleteReview(id: string) {
  return adminDeleteReview({ data: { id } });
}
