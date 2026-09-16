import * as React from "react";

/**
 * Last-resort warning for genuinely unsaved form data on refresh / tab close.
 *
 * This complements draft persistence (the primary recovery mechanism) — it is
 * only installed while there is meaningful input that has NOT been drafted yet.
 * Browsers show their own native confirmation; `beforeunload` cannot render a
 * custom dialog or offer Stay/Leave buttons, so we don't rely on it alone.
 *
 * Internal (SPA) navigation is safe because drafts are persisted, so no
 * in-app blocker is used — avoiding annoying warnings on every link click.
 */
export function useUnsavedChangesGuard(
  active: boolean,
  message = "Your information hasn't been submitted yet. Leave this page?",
): void {
  React.useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require returnValue to be set.
      event.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active, message]);
}
