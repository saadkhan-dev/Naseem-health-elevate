import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, CloudOff } from "lucide-react";
import { motion } from "framer-motion";
import {
  ELFSIGHT_GOOGLE_REVIEWS_APP_ID,
  elfsightContainerClass,
  loadElfsightPlatformScript,
  normalizeElfsightAppId,
} from "@/lib/elfsight";

/**
 * Google Reviews, powered by the Elfsight Google Reviews widget.
 *
 * Replaces the old hand-rolled Google Places integration (Places API key,
 * `getGoogleReviews` server function, `useGoogleReviews` hook and the local
 * review-rendering component) — all of that is gone. Elfsight now hosts and
 * renders the reviews, so this component owns only the surrounding card and the
 * embed lifecycle.
 *
 * The markup matches the official Elfsight install snippet:
 *
 *   <div class="elfsight-app-<APP_ID>" data-elfsight-app-lazy></div>
 *
 * `data-elfsight-app-lazy` makes Elfsight hydrate the widget as it scrolls into
 * view, and `platform.js` is injected at most once per page by
 * `loadElfsightPlatformScript` — never per render.
 */

const DEFAULT_GOOGLE_MAPS_URL = "https://maps.app.goo.gl/43SpKFecmwH9AfoD8";

/**
 * Scoped guard so the third-party widget can never widen the page. Elfsight
 * layouts can set fixed widths, which would otherwise cause horizontal
 * overflow on small screens.
 */
const WIDGET_GUARD_CSS = `
.elfsight-google-reviews__widget,
.elfsight-google-reviews__widget * {
  box-sizing: border-box;
  max-width: 100%;
}
.elfsight-google-reviews__widget iframe,
.elfsight-google-reviews__widget video,
.elfsight-google-reviews__widget img,
.elfsight-google-reviews__widget svg {
  max-width: 100% !important;
}
`;

type WidgetStatus = "loading" | "ready" | "error";

function readEnvAppId(): string | undefined {
  try {
    return (import.meta.env as Record<string, string | undefined>)
      .VITE_ELFSIGHT_GOOGLE_REVIEWS_APP_ID;
  } catch {
    return undefined;
  }
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function ElfsightGoogleReviews({
  isInView,
  appId,
  embedCode,
  googleMapsUrl = DEFAULT_GOOGLE_MAPS_URL,
}: {
  isInView: boolean;
  /** Override the Elfsight app id — accepts a bare id or a pasted snippet. */
  appId?: string;
  /** Raw Elfsight install snippet, if you prefer to paste what they gave you. */
  embedCode?: string;
  googleMapsUrl?: string;
}) {
  const resolvedAppId = useMemo(
    () =>
      normalizeElfsightAppId(embedCode) ??
      normalizeElfsightAppId(appId) ??
      normalizeElfsightAppId(readEnvAppId()) ??
      ELFSIGHT_GOOGLE_REVIEWS_APP_ID,
    [appId, embedCode],
  );

  const [status, setStatus] = useState<WidgetStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    // Injected in an effect, so it never runs during server rendering and
    // never mutates markup before React has hydrated it.
    loadElfsightPlatformScript()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="mx-auto mt-16 w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-md sm:p-8"
    >
      <style dangerouslySetInnerHTML={{ __html: WIDGET_GUARD_CSS }} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
            <GoogleLogo className="h-6 w-6" />
          </div>
          <div>
            <p className="font-serif-display text-xl font-bold text-white">Google Reviews</p>
            <p className="text-[11px] text-white/40 italic">Live rating from Google</p>
          </div>
        </div>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition-all duration-300 hover:border-amber-400/40 hover:bg-white/10 hover:text-white"
        >
          View All on Google
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="elfsight-google-reviews__widget mt-6 w-full min-w-0 max-w-full overflow-x-hidden">
        {/*
          Rendered during SSR and hydration alike so Elfsight's lazy loader can
          observe the container. platform.js is only injected afterwards (in the
          effect above), so it never rewrites this node mid-hydration.
        */}
        <div className={elfsightContainerClass(resolvedAppId)} data-elfsight-app-lazy="" />

        {status === "loading" ? (
          <div className="flex items-center gap-2 py-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Loading Google reviews…
          </div>
        ) : null}

        {status === "error" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/70" />
            <div>
              <p className="text-sm font-semibold text-white/85">
                Google reviews could not be loaded right now.
              </p>
              <p className="mt-0.5 text-xs text-white/45">
                The Elfsight widget script did not load. Please try again later.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
