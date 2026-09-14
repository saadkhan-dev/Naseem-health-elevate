/**
 * Deep-link metadata for the admin notification center.
 *
 * Notifications carry a plain `link` string. To let a notification navigate
 * to the EXACT related record (appointment / order / support message / patient)
 * the link encodes the target entity id as query params:
 *
 *   /admin/appointments?focus=appointment&id=<uuid>
 *
 * The admin pages read these params, scroll to the row and temporarily
 * highlight it. Pure helpers only — safe to import from server modules
 * (actions.functions.ts, payment/consultation helpers) AND client components.
 */

export type FocusKind = "appointment" | "patient" | "order" | "support";

export interface PageFocus {
  focus: FocusKind;
  id: string;
}

/** Build a deep-link `link` for an admin notification row. */
export function buildAdminFocusLink(path: string, focus: FocusKind, id: string): string {
  return `${path}?focus=${focus}&id=${encodeURIComponent(id)}`;
}

/**
 * Read `focus`/`id` out of a parsed TanStack search object
 * (`location.search`). Returns null when either part is missing.
 */
export function parseFocusTarget(search: Record<string, unknown>): PageFocus | null {
  const focus = typeof search.focus === "string" ? search.focus.trim().toLowerCase() : "";
  const id = typeof search.id === "string" ? search.id.trim() : "";
  if (!focus || !id) return null;
  const kinds: FocusKind[] = ["appointment", "patient", "order", "support"];
  if (!kinds.includes(focus as FocusKind)) return null;
  return { focus: focus as FocusKind, id };
}

/** Split a `/path?query` link into a TanStack `to` path and parsed search. */
export function splitNavigationLink(link: string): {
  path: string;
  search: Record<string, string> | undefined;
} {
  const qIndex = link.indexOf("?");
  if (qIndex === -1) return { path: link, search: undefined };
  const params = new URLSearchParams(link.slice(qIndex + 1));
  const search: Record<string, string> = {};
  params.forEach((value, key) => {
    search[key] = value;
  });
  return { path: link.slice(0, qIndex), search };
}
