import { useMemo, useState } from "react";
import { Star, MessageCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useReviews } from "@/hooks/queries/useContent";
import { useSubmitReview } from "@/hooks/queries/useSiteExtra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const REVIEWS_PREVIEW = 3;

export function ReviewsSection() {
  const { data: reviews, isLoading } = useReviews();
  const submitReview = useSubmitReview();

  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const total = reviews?.length ?? 0;
  const average = total > 0 ? (reviews ?? []).reduce((sum, r) => sum + r.rating, 0) / total : 0;
  const canExpand = total > REVIEWS_PREVIEW;

  const visibleReviews = useMemo(() => {
    const list = reviews ?? [];
    return showAll ? list : list.slice(0, REVIEWS_PREVIEW);
  }, [reviews, showAll]);

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
    <section id="reviews" className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold text-red-600 sm:text-5xl">
            Patient Reviews
          </h2>

          <h3 className="mt-3 font-display text-[22px] font-semibold text-primary sm:text-2xl">
            What Our Patients Say
          </h3>

          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            See what patients have shared about their experience and care.
          </p>
        </div>

        <div className="mx-auto mt-7 flex w-fit flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-5 py-3 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft">
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl font-bold text-foreground">
              {total > 0 ? average.toFixed(1) : "—"}
            </span>
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= Math.round(average)
                        ? "fill-current text-yellow-500"
                        : "text-muted-foreground/40"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">Google Reviews</span>
            </div>
          </div>

          <div className="h-9 w-px bg-border" />

          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            disabled={!canExpand}
            className={`rounded-lg px-2 py-1 text-sm transition-colors ${
              canExpand
                ? "font-semibold text-primary hover:underline underline-offset-2"
                : "cursor-default font-medium text-foreground/80"
            }`}
          >
            ({total}) {showAll ? "Show less" : total === 1 ? "review" : "reviews"}
          </button>
        </div>

        {showAll && canExpand ? (
          <div className="mx-auto mt-8 max-w-3xl space-y-4">
            {(reviews ?? []).map((review) => (
              <div
                key={review.id}
                className="flex items-start gap-4 rounded-3xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft sm:p-6"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-base font-bold text-primary">
                  {(review.name || "P").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{review.name}</span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current text-yellow-500" />
                        ))}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MessageCircle className="h-3 w-3 text-primary/40" /> Google Review
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                    "{review.text}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {isLoading ? (
              <div className="flex w-full justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleReviews.length > 0 ? (
              visibleReviews.map((review) => (
                <div
                  key={review.id}
                  className="w-full rounded-3xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99] sm:p-6 md:w-[calc(33.333%-0.667rem)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-1">
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <Star key={index} className="h-4 w-4 fill-current text-yellow-500" />
                      ))}
                    </div>

                    <MessageCircle className="h-5 w-5 text-primary/40" />
                  </div>

                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                    "{review.text}"
                  </p>

                  <p className="mt-5 text-[15px] font-semibold text-foreground sm:text-sm">
                    {review.name}
                  </p>

                  <p className="mt-1 text-[13px] text-muted-foreground sm:text-xs">Google Review</p>
                </div>
              ))
            ) : (
              <p className="w-full py-8 text-center text-sm text-muted-foreground">
                No reviews yet.
              </p>
            )}
          </div>
        )}

        <div className="mt-7 flex justify-center">
          <a
            href="https://maps.app.goo.gl/43SpKFecmwH9AfoD8"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-soft active:scale-[0.97]"
          >
            View All Reviews on Google
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>

        <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold text-primary">Share Your Experience</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Reviews are approved before appearing on the site.
          </p>

          {done ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p className="text-sm font-semibold text-foreground">Thank you for your review!</p>
              <p className="text-xs text-muted-foreground">
                It will appear on the site once approved.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setDone(false)}>
                Write another
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-7 w-7 ${
                        star <= rating ? "fill-current text-yellow-500" : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-10 rounded-xl"
              />
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tell us about your experience..."
                rows={3}
                className="rounded-xl"
              />
              {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
              <Button
                onClick={handleSubmit}
                disabled={submitReview.isPending}
                className="h-10 w-full rounded-xl"
              >
                {submitReview.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                Submit Review
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
