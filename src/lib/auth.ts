import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, staffSupabase } from "./supabase";

/**
 * Production origin used as the base for auth email redirects (email
 * confirmation, etc.). Supabase builds the confirmation-link return URL from
 * this, so clicks land back on the patient portal instead of the raw URL.
 */
const CONFIRM_REDIRECT_ORIGIN = "https://rahathomeophysioclinic.com";

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

/**
 * Turn raw Supabase error messages into friendly, actionable ones.
 * "Failed to fetch" means the browser could not reach the project at all
 * (network, DNS or wrong/dead Supabase URL) — a confusing message for a
 * patient, so it's explained instead of shown verbatim.
 */
function friendlyAuthError(message: string): string {
  const m = (message ?? "").trim();
  const lower = m.toLowerCase();

  if (
    !m ||
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("temporary failure") ||
    lower.includes("econnreset") ||
    lower.includes("could not reach")
  ) {
    return "We couldn't reach the clinic server. Please check your internet connection and try again.";
  }
  if (
    lower.includes("user_already_exists") ||
    lower.includes("already been registered") ||
    lower.includes("email already")
  ) {
    return "An account with this email already exists — please sign in instead.";
  }
  if (lower.includes("invalid email") || lower.includes("email address is invalid")) {
    return "Please enter a valid email address.";
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Please confirm your email first — check your inbox for the confirmation link we sent.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (lower.includes("password should be")) {
    return m;
  }
  return m;
}

/**
 * Run a Supabase auth call and normalize thrown errors (network failures etc.)
 * into `{ error: string | null }`-style results. The message text never
 * crashes the UI and never leaves the form stuck in a loading state.
 */
async function safeAuthCall<T>(
  fn: () => Promise<T>,
  normalize: (result: T) => { error: string | null } | null,
): Promise<{ error: string | null }> {
  try {
    const result = await fn();
    const normalized = normalize(result);
    if (!normalized) return { error: null };
    if (!normalized.error) return normalized;
    return { error: friendlyAuthError(normalized.error) };
  } catch (e) {
    console.error("Auth call failed", e);
    return { error: friendlyAuthError(e instanceof Error ? e.message : "Failed to fetch") };
  }
}

// ---------------------------------------------------------------------------
// Public / patient authentication (uses the public `supabase` client only)
// ---------------------------------------------------------------------------

export async function signUp(email: string, password: string, fullName: string, phone: string) {
  return safeAuthCall(
    () =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${CONFIRM_REDIRECT_ORIGIN}/patient`,
          data: {
            full_name: fullName,
            phone: phone,
          },
        },
      }),
    ({ data, error }) => {
      if (error) return { error: error.message };
      const createdUserId = data?.user?.id ?? null;
      const hasSession = Boolean(data?.session);
      console.info("[signUp] request reached Supabase Auth", {
        email,
        createdUserId,
        hasSession,
        identities: data?.user?.identities?.length ?? 0,
        emailConfirmed: data?.user?.email_confirmed_at ?? null,
      });
      if (!createdUserId) {
        return {
          error:
            "An account with this email may already exist. Please try signing in, or check your inbox for a confirmation link.",
        };
      }
      return { error: null };
    },
  );
}

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlyAuthError(error.message), user: null, role: null };

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
  } catch (e) {
    console.error("Sign in failed", e);
    return {
      error: friendlyAuthError(e instanceof Error ? e.message : "Failed to fetch"),
      user: null,
      role: null,
    };
  }
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
  try {
    const { data, error } = await staffSupabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlyAuthError(error.message), user: null, role: null };

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
  } catch (e) {
    console.error("Staff sign in failed", e);
    return {
      error: friendlyAuthError(e instanceof Error ? e.message : "Failed to fetch"),
      user: null,
      role: null,
    };
  }
}

export async function signOutStaff() {
  await staffSupabase.auth.signOut();
}

export async function getStaffSession() {
  const { data } = await staffSupabase.auth.getSession();
  return data.session;
}
