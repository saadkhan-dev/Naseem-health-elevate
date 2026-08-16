import { useEffect, useState } from "react";

/**
 * Per-widget dismissal state for the floating WhatsApp and Naseem AI
 * controls. Dismissal is independent per widget and persists across
 * navigation and reloads via localStorage, so a button the user closed stays
 * hidden until they restore it from the small restore control.
 *
 * Returns `{ whatsappDismissed, naseemDismissed }` plus dismiss/restore
 * actions. SSR-safe: the initial state is always "visible" and the persisted
 * value is read in an effect, so there is no hydration mismatch and no flash
 * of hidden controls before the browser applies the stored preference.
 */

const WHATSAPP_KEY = "naseem_floating_whatsapp_dismissed";
const NASEEM_KEY = "naseem_floating_naseem_dismissed";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode etc.) — dismissal just won't persist.
  }
}

export function useFloatingDismiss() {
  const [whatsappDismissed, setWhatsappDismissed] = useState(false);
  const [naseemDismissed, setNaseemDismissed] = useState(false);

  useEffect(() => {
    setWhatsappDismissed(readFlag(WHATSAPP_KEY));
    setNaseemDismissed(readFlag(NASEEM_KEY));
  }, []);

  function dismissWhatsapp() {
    writeFlag(WHATSAPP_KEY, true);
    setWhatsappDismissed(true);
  }

  function dismissNaseem() {
    writeFlag(NASEEM_KEY, true);
    setNaseemDismissed(true);
  }

  function restoreWhatsapp() {
    writeFlag(WHATSAPP_KEY, false);
    setWhatsappDismissed(false);
  }

  function restoreNaseem() {
    writeFlag(NASEEM_KEY, false);
    setNaseemDismissed(false);
  }

  return {
    whatsappDismissed,
    naseemDismissed,
    dismissWhatsapp,
    dismissNaseem,
    restoreWhatsapp,
    restoreNaseem,
  };
}
