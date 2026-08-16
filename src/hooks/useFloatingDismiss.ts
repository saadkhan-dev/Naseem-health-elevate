import { useEffect, useSyncExternalStore } from "react";

/**
 * Per-widget dismissal state for the floating WhatsApp and Naseem AI
 * controls. Dismissal is independent per widget, persists across navigation
 * and reloads via localStorage, and — crucially — is shared across every
 * consumer via a small module-level store.
 *
 * Because the state lives in one place (and updates via `useSyncExternalStore`),
 * dismissing WhatsApp in the footer immediately reveals the restore control and
 * restoring either widget instantly brings back the button, with no manual page
 * refresh.
 *
 * SSR-safe: the server snapshot is always "visible" so there is no hydration
 * mismatch, and the persisted value is only applied on the client.
 */

const WHATSAPP_KEY = "naseem_floating_whatsapp_dismissed";
const NASEEM_KEY = "naseem_floating_naseem_dismissed";

type DismissState = { whatsapp: boolean; naseem: boolean };

const DEFAULT_STATE: DismissState = { whatsapp: false, naseem: false };

let current: DismissState = readFlags();
const listeners = new Set<() => void>();

function readFlags(): DismissState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    return {
      whatsapp: window.localStorage.getItem(WHATSAPP_KEY) === "1",
      naseem: window.localStorage.getItem(NASEEM_KEY) === "1",
    };
  } catch {
    return DEFAULT_STATE;
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

function setFlag(key: string, value: boolean) {
  writeFlag(key, value);
  current = readFlags();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DismissState {
  return current;
}

function getServerSnapshot(): DismissState {
  return DEFAULT_STATE;
}

export function useFloatingDismiss() {
  // Keep the module store in sync when dismissal happens in another tab.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === WHATSAPP_KEY || e.key === NASEEM_KEY) {
        current = readFlags();
        listeners.forEach((l) => l());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { whatsapp, naseem } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    whatsappDismissed: whatsapp,
    naseemDismissed: naseem,
    dismissWhatsapp: () => setFlag(WHATSAPP_KEY, true),
    dismissNaseem: () => setFlag(NASEEM_KEY, true),
    restoreWhatsapp: () => setFlag(WHATSAPP_KEY, false),
    restoreNaseem: () => setFlag(NASEEM_KEY, false),
  };
}
