import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { staffSupabase } from "@/lib/supabase";
import { signInStaff, signOutStaff, getProfile, type Profile, type Role } from "@/lib/auth";

interface StaffAuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  loginStaff: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; role: Role | null }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const StaffAuthContext = createContext<StaffAuthState>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  loginStaff: async () => ({ error: null, role: null }),
  logout: async () => {},
  refreshProfile: async () => null,
});

/**
 * Admin / staff authentication state for the Admin Panel. Reads the dedicated
 * staff Supabase client (`sb-<project>-staff-auth-token` storage key) only, so
 * it is fully independent from the public/patient session. Admin routes guard
 * on this context, and admin/doctor accounts can never show up as "logged in"
 * on the public website.
 */
export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    staffSupabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(staffSupabase, session.user.id).then(setProfile);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = staffSupabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(staffSupabase, session.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginStaff = useCallback(async (email: string, password: string) => {
    const result = await signInStaff(email, password);
    if (result.error || !result.user) {
      return { error: result.error, role: null };
    }
    const p = await getProfile(staffSupabase, result.user.id);
    setProfile(p);
    return { error: null, role: p?.role ?? null };
  }, []);

  const logout = useCallback(async () => {
    await signOutStaff();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    const p = await getProfile(staffSupabase, user.id);
    setProfile(p);
    return p;
  }, [user]);

  return (
    <StaffAuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        loginStaff,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  return useContext(StaffAuthContext);
}
