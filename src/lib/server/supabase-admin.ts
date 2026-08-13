import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

function getServiceRoleKey(): string {
  return (
    (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) ??
    (import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) ??
    ""
  );
}

let adminClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service-role key.
 *
 * Never import this from client components or event handlers — it exists for
 * TanStack Start server functions (see `src/lib/server/actions.functions.ts`).
 *
 * The service-role key bypasses RLS, so every caller must be authorized inside
 * the server function (the `adminMiddleware` checks the JWT + profile role).
 *
 * Set `SUPABASE_SERVICE_ROLE_KEY` in your server environment (Node: .env /
 * process env; Cloudflare Workers: a secret binding). See the README for setup.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const serviceKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Add it to your server environment (see README → SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/**
 * Check whether the caller's JWT belongs to a `doctor` or `admin` profile.
 * Used by public server functions that want to return staff-only fields
 * (e.g. the internal session id needed to mark a call completed). Returns
 * false for guests and patients — it never throws.
 */
export async function isAdminOrDoctor(
  client: SupabaseClient,
  accessToken: string | null | undefined,
): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const { data: userData, error } = await client.auth.getUser(accessToken);
    if (error || !userData.user) return false;
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    return profile?.role === "doctor" || profile?.role === "admin";
  } catch {
    return false;
  }
}
