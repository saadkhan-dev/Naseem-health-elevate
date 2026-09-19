import { Link, useLocation } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Floating blinking "Sign Up / Sign In" prompt for guests. Shown on public
 * pages while a patient browses / books; hidden in the fullscreen video room
 * and admin pages, and disappears once the patient is signed in.
 */
export function SignInBlink() {
  const { user } = useAuth();
  const location = useLocation();

  if (user) return null;
  if (location.pathname.startsWith("/admin") || location.pathname.startsWith("/video/")) {
    return null;
  }

  return (
    <Link
      to="/patient"
      aria-label="Sign up or sign in to your patient account"
      className="animate-signin-blink fixed bottom-4 right-4 z-40 inline-flex h-11 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 text-[13px] font-bold text-black shadow-soft transition-transform hover:-translate-y-0.5 hover:brightness-[1.05] active:scale-95 sm:bottom-6 sm:right-6 sm:px-5 sm:text-sm"
    >
      <UserRound className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">Sign Up / Sign In</span>
    </Link>
  );
}
