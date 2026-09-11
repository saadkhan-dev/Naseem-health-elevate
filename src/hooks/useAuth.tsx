import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { signUp, signIn, signOut, getProfile, type Profile, type Role } from "@/lib/auth";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null; role: Role | null }>;
  register: (
    email: string,
    password: string,
    name: string,
    phone: string,
  ) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  login: async () => ({ error: null, role: null }),
  register: async () => null,
  logout: async () => {},
  refreshProfile: async () => null,
});

/**
 * Public / patient authentication state. Reads the PUBLIC Supabase client
 * (`sb-<project>-public-auth-token` storage key) only — the Admin Panel session
 * lives in a separate staff client and can never leak into this context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(supabase, session.user.id).then(setProfile);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(supabase, session.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await signIn(email, password);
    if (result.error || !result.user) {
      return { error: result.error, role: null };
    }
    const p = await getProfile(supabase, result.user.id);
    setProfile(p);
    return { error: null, role: p?.role ?? "patient" };
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, phone: string) => {
      const result = await signUp(email, password, name, phone);
      return result.error;
    },
    [],
  );

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    const p = await getProfile(supabase, user.id);
    setProfile(p);
    return p;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
