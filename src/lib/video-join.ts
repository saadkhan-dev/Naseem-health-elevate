/**
 * Canonical patient join URL for an online video consultation.
 *
 * This is the ONE link used everywhere the patient joins a call:
 *  - the WhatsApp / SMS / email "video ready" notification
 *  - the admin "Copy Link" button
 *
 * The base comes from the server's configured public site URL (`SITE_URL`),
 * never from `window.location.origin` in production, so the same absolute
 * `https://your-domain.com/video/VC-XXXXXX` URL is produced everywhere.
 *
 * Client-safe: no server-only imports.
 */

/** Strip trailing slashes and require an absolute http(s) URL. */
export function normalizeSiteUrl(siteUrl: string | undefined | null): string | undefined {
  const trimmed = (siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Build the patient-facing join URL for a VC code.
 *
 * Returns an absolute URL when a site URL is configured (production — built
 * from `SITE_URL`). Falls back to a relative `/video/VC-XXXXXX` only when no
 * site URL is configured (local development).
 */
export function videoJoinUrl(siteUrl: string | undefined | null, vcNo: string): string {
  const base = normalizeSiteUrl(siteUrl);
  return base ? `${base}/video/${vcNo}` : `/video/${vcNo}`;
}
