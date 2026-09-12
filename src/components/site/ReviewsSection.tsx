import { useState, useRef } from "react";
import { Star, MessageCircle, Loader2, CheckCircle2 } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useReviews } from "@/hooks/queries/useContent";
import { useSubmitReview } from "@/hooks/queries/useSiteExtra";
import { GoogleReviewsBlock } from "./GoogleReviewsBlock";
import { WebsiteReviewsBlock } from "./WebsiteReviewsBlock";

export function ReviewsSection() {
  const { data: reviews, isLoading, isError } = useReviews();
  const submitReview = useSubmitReview();

  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  async function handleSubmit() {
    setFormError("");
    if (!name.trim()) {
      setFormError("Please enter your name.");
      return;
    }
    try {
      const result = await submitReview.mutateAsync({
        name: name.trim(),
        rating,
        text: text.trim(),
      });
      if (result.error) {
        setFormError(result.error);
      } else {
        setDone(true);
        setName("");
        setText("");
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <section id="reviews" className="relative overflow-hidden bg-black text-white">
      {/* Calm ambient teal/emerald orbs so the section matches the site theme */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-teal-500/10 blur-[120px]" />
      </div>
      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Patient Reviews
          </span>
          <h2 className="mt-5 font-serif-display text-4xl sm:text-5xl font-bold text-white mb-2 lg:text-6xl">
            Words That{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]">
              Heal & Inspire
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
            Real experiences from patients who trusted
            <span className="font-semibold text-emerald-300"> Dr. Naseem Ahmed Khan</span> with
            their natural healing journey — share yours below too.
          </p>
        </motion.div>

        <GoogleReviewsBlock isInView={isInView} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mx-auto mt-16 max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-2xl"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400/20 via-emerald-400/80 to-cyan-400/20" />
          <div className="p-6 sm:p-8">
            <h3 className="font-serif-display text-2xl sm:text-3xl font-bold text-center bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
              Share Your Experience
            </h3>
            <p className="mt-2 text-center text-xs text-white/45 italic">
              Reviews are approved before appearing on the site.
            </p>

            {done ? (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <p className="text-base font-semibold text-white">Thank you for your review!</p>
                <p className="text-sm text-white/60 italic">
                  It will appear on the site once approved.
                </p>
                <button
                  type="button"
                  className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all hover:bg-white/10 hover:scale-105"
                  onClick={() => setDone(false)}
                >
                  Write another
                </button>
              </div>
            ) : (
              <div className="mt-8 space-y-5">
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      aria-label={`${star} star${star > 1 ? "s" : ""}`}
                      className="transition-transform hover:scale-110 focus:outline-none"
                    >
                      <Star
                        className={`h-8 w-8 ${
                          star <= rating ? "fill-emerald-400 text-emerald-400" : "text-white/20"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-white placeholder-white/40 focus:border-emerald-400/50 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Tell us about your experience..."
                  rows={4}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-white placeholder-white/40 focus:border-emerald-400/50 focus:outline-none focus:ring-1 focus:ring-emerald-400/50 resize-none"
                />
                {formError && (
                  <p className="text-sm font-medium text-red-400 text-center">{formError}</p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitReview.isPending}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400/20 border border-emerald-400/50 text-emerald-300 font-semibold transition-all hover:bg-emerald-400/30 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {submitReview.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-5 w-5" />
                  )}
                  Submit Review
                </button>
              </div>
            )}
          </div>
        </motion.div>

        <WebsiteReviewsBlock
          reviews={reviews}
          isLoading={isLoading}
          isError={isError}
          isInView={isInView}
        />
      </div>
    </section>
  );
}
