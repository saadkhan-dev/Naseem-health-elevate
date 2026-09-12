import { useState } from "react";
import { Star, MessageCircle, Loader2, Quote, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import type { Review } from "@/lib/site-content";

const WEBSITE_REVIEWS_PREVIEW = 3;

interface WebsiteReviewsBlockProps {
  reviews?: Review[];
  isLoading: boolean;
  isError: boolean;
  isInView: boolean;
}

export function WebsiteReviewsBlock({
  reviews,
  isLoading,
  isError,
  isInView,
}: WebsiteReviewsBlockProps) {
  const [showAll, setShowAll] = useState(false);

  const total = reviews?.length ?? 0;
  const average = total > 0 ? (reviews ?? []).reduce((sum, r) => sum + r.rating, 0) / total : 0;
  const canExpand = total > WEBSITE_REVIEWS_PREVIEW;

  const visibleReviews = showAll
    ? (reviews ?? [])
    : (reviews ?? []).slice(0, WEBSITE_REVIEWS_PREVIEW);

  function toggle() {
    if (canExpand) setShowAll((s) => !s);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay: 0.45 }}
      className="mx-auto mt-16 max-w-5xl"
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!canExpand}
        aria-expanded={showAll}
        className={`mx-auto flex w-fit flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 backdrop-blur-md shadow-lg transition-all duration-300 ${
          canExpand
            ? "cursor-pointer hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-white/10"
            : "cursor-default"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="font-serif-display text-2xl font-bold text-white">
            {total > 0 ? average.toFixed(1) : "—"}
          </span>
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-4 w-4 ${
                    star <= Math.round(average)
                      ? "fill-emerald-400 text-emerald-400"
                      : "text-white/20"
                  }`}
                />
              ))}
            </span>
            <span className="text-[11px] text-white/40 italic">
              <strong>Website Reviews</strong>
            </span>
          </span>
        </span>

        <span aria-hidden className="h-9 w-px bg-white/10" />

        <span
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors ${
            canExpand
              ? "cursor-pointer font-semibold text-emerald-400"
              : "cursor-default font-medium text-white/40"
          }`}
        >
          ({total}) {total === 1 ? "review" : "reviews"}
          <span
            aria-hidden
            className={`transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </span>
      </button>

      <div className="mt-8">
        {isError ? (
          <p className="w-full py-8 text-center text-sm text-white/40 italic">
            Reviews are temporarily unavailable.
          </p>
        ) : isLoading ? (
          <div className="flex w-full justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : total > 0 ? (
          <>
            {showAll && canExpand ? (
              <div className="mx-auto max-w-3xl space-y-4">
                {(reviews ?? []).map((review, index) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.5, delay: index * 0.08 }}
                    className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-white/10 sm:p-6"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-base font-bold text-emerald-400 ring-1 ring-emerald-400/30">
                      {(review.name || "P").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{review.name}</span>
                          <span className="flex gap-0.5">
                            {Array.from({ length: review.rating }).map((_, i) => (
                              <Star
                                key={i}
                                className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400"
                              />
                            ))}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] text-white/40 italic">
                          <MessageCircle className="h-3 w-3 text-emerald-400/60" />{" "}
                          <strong>Website Review</strong>
                        </span>
                      </div>
                      <p className="mt-2 text-[15px] leading-relaxed text-white/60 sm:text-sm">
                        "{review.text}"
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-4">
                {visibleReviews.map((review, index) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                    transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                    className="w-full md:w-[calc(33.333%-0.667rem)]"
                  >
                    <div className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:border-emerald-400/30 hover:bg-white/10 active:scale-[0.99]">
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      />
                      <Quote
                        aria-hidden
                        className="absolute -right-2 -top-2 h-16 w-16 text-emerald-400/10 transition-colors duration-300 group-hover:text-emerald-400/20"
                      />
                      <div className="relative flex items-start justify-between gap-3">
                        <div className="flex gap-1">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                          ))}
                        </div>
                        <MessageCircle className="h-5 w-5 text-emerald-400/40" />
                      </div>

                      <p className="relative mt-4 text-[15px] leading-relaxed text-white/60 sm:text-sm italic">
                        "{review.text}"
                      </p>

                      <div className="relative mt-5 flex items-center gap-3 border-t border-dashed border-white/10 pt-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-xs font-bold text-emerald-400">
                          {(review.name || "P").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-white sm:text-sm">
                            {review.name}
                          </p>
                          <p className="text-[11px] text-white/40 italic">Website Review</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="w-full py-8 text-center text-sm text-white/40 italic">
            No website reviews yet — be the first to share your experience below.
          </p>
        )}
      </div>
    </motion.div>
  );
}
