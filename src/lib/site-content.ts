import { supabase } from "@/lib/supabase";
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

export async function getConditions(category: ConditionCategory): Promise<Condition[]> {
  const { data } = await supabase
    .from("conditions")
    .select("*")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function getReviews(): Promise<Review[]> {
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("is_active", true)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  return data ?? [];
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

// --- Admin: Reviews ---

export async function getAllReviews(): Promise<Review[]> {
  const { data } = await supabase
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
