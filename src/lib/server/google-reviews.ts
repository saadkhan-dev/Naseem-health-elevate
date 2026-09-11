import { z } from "zod";

/**
 * Server-side Google Reviews loader.
 *
 * Uses the Google Places API (New) to read the clinic's live rating and
 * review text. The Places API key and place ID are read ONLY from server
 * environment variables (`.env` for local / Cloudflare secret bindings for
 * deployment) and are never shipped to the browser — the frontend only calls
 * the `getGoogleReviews` TanStack server function which proxies here.
 *
 * Key is empty -> the loader returns a graceful "unavailable" payload so the
 * Reviews section degrades cleanly instead of throwing.
 */

/** Read a server env var from process.env (Node) or import.meta.env (Vite/Workers). */
function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[name];
    if (value) return value;
  }
  try {
    const viteEnv = import.meta.env as unknown as Record<string, string | undefined>;
    return viteEnv[name];
  } catch {
    return undefined;
  }
}

const GOOGLE_PLACES_API = "https://places.googleapis.com/v1";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  at: number;
  payload: GoogleReviewsResult;
}

// Lightweight in-process TTL cache. Good enough to avoid hammering the Places
// API from a single worker instance; site visitors share this module.
const cache = new Map<string, CacheEntry>();

export interface GoogleReviewItem {
  name: string | null;
  rating: number;
  text: string | null;
  relativePublishTimeDescription: string | null;
}

export interface GoogleReviewsResult {
  ok: boolean;
  error: string | null;
  /** The clinic's Google rating (average), or null when unavailable. */
  rating: number | null;
  /** Total number of Google reviews, or null when unavailable. */
  totalCount: number | null;
  reviews: GoogleReviewItem[];
  source: "google" | "unavailable";
}

const reviewSchema = z
  .object({
    name: z.string().nullable(),
    rating: z.number(),
    text: z.object({ text: z.string() }).nullable().optional(),
    relativePublishTimeDescription: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * Fetch the place details (rating, userRatingCount, reviews) from Google.
 * Throws on network/API failure so the caller can fall back to unavailable.
 */
async function fetchFromGoogle(apiKey: string, placeId: string): Promise<GoogleReviewsResult> {
  const res = await fetch(
    `${GOOGLE_PLACES_API}/places/${encodeURIComponent(placeId)}?fields=displayName,rating,userRatingCount,reviews&languageCode=en`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,rating,userRatingCount,reviews.authorAttribution.displayName,reviews.authorAttribution.uri,reviews.rating,reviews.text,reviews.relativePublishTimeDescription",
        "content-type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Places API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  const rating = typeof json.rating === "number" ? json.rating : null;
  const totalCount = typeof json.userRatingCount === "number" ? json.userRatingCount : null;

  const rawReviews = Array.isArray(json.reviews) ? (json.reviews as unknown[]) : [];
  const reviews: GoogleReviewItem[] = [];
  for (const raw of rawReviews) {
    const parsed = reviewSchema.safeParse(raw);
    if (!parsed.success) continue;
    const text = parsed.data.text?.text ?? null;
    reviews.push({
      name: parsed.data.name ?? null,
      rating: parsed.data.rating,
      text,
      relativePublishTimeDescription: parsed.data.relativePublishTimeDescription ?? null,
    });
  }

  return { ok: true, error: null, rating, totalCount, reviews, source: "google" };
}

function unavailable(error: string): GoogleReviewsResult {
  return {
    ok: false,
    error,
    rating: null,
    totalCount: null,
    reviews: [],
    source: "unavailable",
  };
}

/**
 * Public entry point used by the TanStack server function. Never throws for
 * configuration problems — the UI depends on the result being well-shaped.
 */
export async function getGoogleReviewsServer(): Promise<GoogleReviewsResult> {
  const apiKey = readEnv("GOOGLE_PLACES_API_KEY");
  const placeId = readEnv("GOOGLE_PLACES_PLACE_ID");

  if (!apiKey || !placeId) {
    return unavailable(
      !apiKey ? "Google Places API key is not configured." : "Google Place ID is not configured.",
    );
  }

  const cached = cache.get(placeId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  try {
    const payload = await fetchFromGoogle(apiKey, placeId);
    cache.set(placeId, { at: Date.now(), payload });
    return payload;
  } catch (err) {
    // Network / API errors fall back gracefully; keep any previous cache.
    const stale = cache.get(placeId);
    if (stale) return { ...stale.payload, error: null };
    return unavailable("Google reviews are temporarily unavailable.");
  }
}
