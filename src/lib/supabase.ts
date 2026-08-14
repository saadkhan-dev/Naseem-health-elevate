import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars");
}

// Project reference (the subdomain of the Supabase URL) — used to namespace the
// auth storage keys so the public/patient session and the admin/staff session
// can NEVER collide, even when both users are active in the same browser.
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

/**
 * Public / patient-facing Supabase client.
 *
 * This client's auth session is persisted under its own localStorage key
 * (`sb-<project>-public-auth-token`), completely separate from the admin
 * session. The public navbar reads ONLY this client, so an admin/doctor being
 * signed into the Admin Panel never appears as a logged-in user on the public
 * website.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: `sb-${projectRef}-public-auth-token`,
  },
});

/**
 * Admin / staff Supabase client.
 *
 * Admin and doctor sessions live ONLY in this client, persisted under a
 * separate localStorage key (`sb-<project>-staff-auth-token`). Admin routes and
 * the `adminMiddleware` server functions read the token from THIS client, and
 * admin data reads (RLS-gated by `is_admin()`) run through it. It shares the
 * same Supabase project and anon key — RLS is unchanged; only the browser
 * storage is separated.
 */
export const staffSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: `sb-${projectRef}-staff-auth-token`,
  },
});
