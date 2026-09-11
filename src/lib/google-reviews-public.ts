import { getGoogleReviews } from "@/lib/actions.functions";
import type { GoogleReviewsResult } from "@/lib/server/google-reviews";

/**
 * Public client-side loader for live Google reviews. Talks only to the
 * server-side `getGoogleReviews` function — the Places API key never leaves
 * the server.
 */
export async function fetchGoogleReviews(): Promise<GoogleReviewsResult> {
  try {
    return await getGoogleReviews({ data: undefined });
  } catch {
    return {
      ok: false,
      error: "Google reviews are temporarily unavailable.",
      rating: null,
      totalCount: null,
      reviews: [],
      source: "unavailable",
    };
  }
}
