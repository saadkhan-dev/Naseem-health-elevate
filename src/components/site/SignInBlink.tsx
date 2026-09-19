import { Link } from "@tanstack/react-router";
import { LogIn, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFloatingControls } from "@/hooks/useFloatingControls";
import { useFloatingDismiss } from "@/hooks/useFloatingDismiss";

/**
 * Floating blinking "Sign Up / Sign In" prompt for guests. On mobile it sits
 * small on the mid-left edge of the screen; on laptop it anchors bottom-left.
 * Closable via the small X and restorable from the floating restore menu
 * (same dismiss/persist system as WhatsApp / AI).
 */
export function SignInBlink() {
  const { user } = useAuth();
  const { hidden } = useFloatingControls();
  const { signinDismissed, dismissSignin } = useFloatingDismiss();

  if (user || hidden || signinDismissed) return null;

  return (
    <div className="fixed left-1 top-1/2 z-40 -translate-y-1/2 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:left-[calc(env(safe-area-inset-left,0px)+1.25rem)] sm:top-auto sm:translate-y-0">
      <div className="relative">
        <Link
          to="/patient"
          aria-label="Sign up or sign in to your patient account"
          className="animate-signin-blink inline-flex h-9 max-w-[calc(100vw-1rem)] items-center gap-1 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 px-3 text-[11px] font-bold text-black shadow-soft transition-transform hover:-translate-y-0.5 hover:brightness-[1.05] active:scale-95 sm:h-11 sm:gap-2 sm:px-5 sm:text-sm"
        >
          <LogIn className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
          <span className="whitespace-nowrap sm:hidden">Sign In</span>
          <span className="hidden whitespace-nowrap sm:inline">Sign Up / Sign In</span>
        </Link>
        <button
          type="button"
          aria-label="Hide Sign In prompt"
          onClick={() => dismissSignin()}
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-all duration-300 hover:bg-background hover:text-foreground active:scale-90 sm:h-6 sm:w-6"
        >
          <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      </div>
    </div>
  );
}
