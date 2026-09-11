import { useMemo, useState } from "react";
import { Star, Loader2, ExternalLink, ChevronDown, ChevronUp, CloudOff } from "lucide-react";
import { motion } from "framer-motion";
import { useGoogleReviews } from "@/hooks/queries/useContent";

const GOOGLE_REVIEWS_PREVIEW = 3;
const GOOGLE_MAPS_URL = "https://maps.app.goo.gl/43SpKFecmwH9AfoD8";

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

function GoogleStars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span aria-hidden className={`flex items-center gap-0.5 ${className ?? ""}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= filled ? "fill-amber-400 text-amber-400" : "text-white/20"
          }`}
        />
      ))}
    </span>
  );
}

export function GoogleReviewsBlock({ isInView }: { isInView: boolean }) {
  const { data, isLoading } = useGoogleReviews();
  const [showAll, setShowAll] = useState(false);

  const ok = Boolean(data?.ok && data.source === "google");
  const reviews = useMemo(() => data?.reviews ?? [], [data?.reviews]);
  const canExpand = ok && reviews.length > GOOGLE_REVIEWS_PREVIEW;

  const visibleReviews = useMemo(
    () => (showAll ? reviews : reviews.slice(0, GOOGLE_REVIEWS_PREVIEW)),
    [reviews, showAll],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="mx-auto mt-16 max-w-5xl rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-md sm:p-8"
    >
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
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition-all duration-300 hover:border-amber-400/40 hover:bg-white/10 hover:text-white"
        >
          View All on Google
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="mt-6">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            Loading Google reviews…
          </div>
        ) : !ok ? (
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-400/70" />
            <div>
              <p className="text-sm font-semibold text-white/85">
                Google reviews are temporarily unavailable.
              </p>
              <p className="mt-0.5 text-xs text-white/45">
                {data?.error ?? "Please try again later."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span className="font-serif-display text-5xl font-bold text-white">
                  {typeof data.rating === "number" ? data.rating.toFixed(1) : "—"}
                </span>
                <span className="text-sm text-white/40">/ 5</span>
              </div>
              <div className="flex flex-col gap-1">
                <GoogleStars rating={data.rating ?? 0} className="!gap-1 [&>svg]:h-5 [&>svg]:w-5" />
                <p className="text-xs text-white/50">
                  Based on{" "}
                  {data.totalCount
                    ? `${data.totalCount.toLocaleString("en-US")} Google reviews`
                    : "Google reviews"}
                </p>
              </div>
            </div>

            {reviews.length > 0 ? (
              <div className="mt-7 space-y-3">
                {visibleReviews.map((review, index) => (
                  <motion.div
                    key={`${review.name}-${index}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.5, delay: index * 0.08 }}
                    className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md transition-colors duration-300 hover:border-amber-400/30 hover:bg-white/10"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-sm font-bold text-amber-300 ring-1 ring-amber-400/25">
                      {(review.name ?? "G").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {review.name ?? "Google User"}
                          </span>
                          <GoogleStars rating={review.rating} />
                        </div>
                        {review.relativePublishTimeDescription ? (
                          <span className="text-[11px] text-white/35 italic">
                            {review.relativePublishTimeDescription}
                          </span>
                        ) : null}
                      </div>
                      {review.text ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                          {review.text}
                        </p>
                      ) : null}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-white/40 italic">
                No written Google reviews available right now.
              </p>
            )}

            {canExpand ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  aria-expanded={showAll}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-all duration-300 hover:bg-amber-400/20 hover:scale-105 active:scale-95"
                >
                  {showAll ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      View All Google Reviews
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  );
}
