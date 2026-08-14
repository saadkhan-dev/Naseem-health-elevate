import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, staffSupabase } from "./supabase";

export type Role = "patient" | "doctor" | "admin";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  created_at: string;
}

/** Read a profile row with the given client (public or staff). */
export async function getProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await client.from("profiles").select("*").eq("id", userId).single();
  return data;
}

// ---------------------------------------------------------------------------
// Public / patient authentication (uses the public `supabase` client only)
// ---------------------------------------------------------------------------

export async function signUp(email: string, password: string, fullName: string, phone: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone: phone,
      },
    },
  });
  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message, user: null, role: null };

  const profile = await getProfile(supabase, data.user.id);

  // Public patient login: admin/doctor accounts must use the secure admin
  // access. Reject the session entirely so staff credentials never grant
  // access via the patient portal.
  if (profile && (profile.role === "admin" || profile.role === "doctor")) {
    await supabase.auth.signOut();
    return {
      error: "Admin/Doctor accounts must use the secure admin access.",
      user: null,
      role: null,
    };
  }

  return { error: null, user: data.user, role: profile?.role ?? "patient" };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ---------------------------------------------------------------------------
// Admin / staff authentication (uses the separate `staffSupabase` client only)
// ---------------------------------------------------------------------------

export async function signInStaff(email: string, password: string) {
  const { data, error } = await staffSupabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message, user: null, role: null };

  const profile = await getProfile(staffSupabase, data.user.id);

  // Secure staff login (admin area only): admin/doctor accounts only.
  if (!profile || (profile.role !== "admin" && profile.role !== "doctor")) {
    await staffSupabase.auth.signOut();
    return {
      error: "This account is not authorized to access the admin area.",
      user: null,
      role: null,
    };
  }

  return { error: null, user: data.user, role: profile.role };
}

export async function signOutStaff() {
  await staffSupabase.auth.signOut();
}

export async function getStaffSession() {
  const { data } = await staffSupabase.auth.getSession();
  return data.session;
}
