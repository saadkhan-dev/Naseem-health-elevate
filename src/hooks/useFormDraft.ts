import * as React from "react";

/**
 * Reusable in-progress form draft persistence.
 *
 * Non-sensitive form input is saved to localStorage so an accidental refresh,
 * navigation or tab close never loses what the patient typed. Drafts expire
 * after a few days and are cleared on successful submit.
 *
 * Never store payment credentials, card numbers, passwords or secrets here —
 * only plain patient input (names, IDs, messages, delivery details, etc.).
 *
 * SSR-safe: restoration happens in an effect (client only) so server render
 * and hydration never mismatch.
 */

const DRAFT_PREFIX = "health-elevate:draft:";
const DEFAULT_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredDraft<T> {
  value: T;
  savedAt: number;
}

function storageKey(key: string): string {
  return `${DRAFT_PREFIX}${key}`;
}

/** Read a stored draft (returns null when missing/expired/corrupt/SSR). */
export function readFormDraft<T>(key: string, expireMs = DEFAULT_EXPIRE_MS): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return null;
    if (expireMs > 0 && Date.now() - (parsed.savedAt ?? 0) > expireMs) {
      window.localStorage.removeItem(storageKey(key));
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeFormDraft<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Storage disabled/full — drafts are best-effort and must never throw.
  }
}

export function clearFormDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

/** Whether a (non-expired) draft exists for this key. */
export function hasFormDraft(key: string, expireMs = DEFAULT_EXPIRE_MS): boolean {
  return readFormDraft<unknown>(key, expireMs) != null;
}

function defaultMeaningful(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((v) => defaultMeaningful(v));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => defaultMeaningful(v));
  }
  return false;
}

export interface FormDraftOptions<T> {
  /** Draft lifetime in ms (default 7 days). 0 = never expire. */
  expireMs?: number;
  /** Whether a value is worth persisting/restoring (defaults to "has content"). */
  isMeaningful?: (value: T) => boolean;
  /** Pause persistence (e.g. after a successful submit). */
  enabled?: boolean;
}

export interface FormDraftApi<T> {
  value: T;
  setValue: React.Dispatch<React.SetStateAction<T>>;
  update: (patch: Partial<T>) => void;
  clearDraft: () => void;
  /** True when a previously saved draft was restored on mount. */
  restored: boolean;
  /** True when there is meaningful content not yet flushed to localStorage. */
  dirty: boolean;
}

/**
 * Use a persisted form object. `value` behaves like state; every meaningful
 * change is written to localStorage (debounced). Call `clearDraft()` after a
 * successful submit.
 */
export function useFormDraft<T extends object>(
  key: string,
  initial: T,
  options: FormDraftOptions<T> = {},
): FormDraftApi<T> {
  const { expireMs = DEFAULT_EXPIRE_MS, isMeaningful, enabled = true } = options;
  const meaningful = React.useMemo(
    () => isMeaningful ?? ((v: T) => defaultMeaningful(v)),
    [isMeaningful],
  );

  const [value, setValue] = React.useState<T>(initial);
  const [restored, setRestored] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const skipFirstPersist = React.useRef(true);

  // Restore once on mount (client only).
  React.useEffect(() => {
    const saved = readFormDraft<T>(key, expireMs);
    if (saved && meaningful(saved)) {
      setValue((cur) => ({ ...cur, ...saved }));
      setRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist meaningful changes; drop the draft when the form is emptied.
  React.useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    if (!enabled) {
      setDirty(false);
      return;
    }
    if (!meaningful(value)) {
      clearFormDraft(key);
      setDirty(false);
      return;
    }
    setDirty(true);
    const t = setTimeout(() => {
      writeFormDraft(key, value);
      setDirty(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key, enabled]);

  const clearDraft = React.useCallback(() => {
    clearFormDraft(key);
    setValue(initial);
    setRestored(false);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = React.useCallback((patch: Partial<T>) => {
    setValue((cur) => ({ ...cur, ...patch }));
  }, []);

  return { value, setValue, update, clearDraft, restored, dirty };
}
