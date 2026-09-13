/**
 * Pure helpers for the realtime notification cache updates (Phase 5).
 *
 * Realtime rows carry only partial columns for UPDATE events (replica identity
 * default => primary key + changed columns), so these helpers overlay the
 * incoming row onto the cached newest-first list instead of replacing it. The
 * React Query hooks in `src/hooks/useNotificationRealtime.ts` call these and
 * then invalidate the query so a background refetch reconciles ordering/limits.
 *
 * Kept outside the hooks module (no React/Supabase imports) so the offline
 * notification tests can exercise the exact merge rules.
 */

export type NotificationChangeKind = "INSERT" | "UPDATE" | "DELETE";

/** Matches the `LIMIT 100` used by the notification fetch server functions. */
export const NOTIFICATION_CACHE_LIMIT = 100;

export interface NotificationLike {
  id: string;
}

/**
 * Apply one realtime change to a cached notification list (`created_at desc`).
 *
 * - INSERT: prepend (dedup by id, newest first), capped at NOTIFICATION_CACHE_LIMIT.
 * - UPDATE: overlay the changed columns onto the matching row (or prepend if
 *   the row is not in the cache yet).
 * - DELETE: remove by id.
 * - Returns `undefined` unchanged when there is no cache yet (the enclosing
 *   component will still refetch via `invalidateQueries`).
 */
export function applyNotificationChange<T extends NotificationLike>(
  current: T[] | undefined,
  row: (Partial<T> & NotificationLike) | undefined,
  kind: NotificationChangeKind,
): T[] | undefined {
  if (!current || !row?.id) return current;

  if (kind === "DELETE") {
    return current.filter((n) => n.id !== row.id);
  }

  const index = current.findIndex((n) => n.id === row.id);
  const merged = { ...(index >= 0 ? current[index] : {}), ...row } as T;

  if (index >= 0) {
    const next = current.slice();
    next[index] = merged;
    return next;
  }

  return [merged, ...current].slice(0, NOTIFICATION_CACHE_LIMIT);
}
