import { useMemo, useState } from "react";
import { Star, MessageCircle, Loader2, CheckCircle2, Quote } from "lucide-react";
import { useReviews } from "@/hooks/queries/useContent";
import { useSubmitReview } from "@/hooks/queries/useSiteExtra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Reveal } from "@/components/site/Reveal";
import { SectionDeco } from "@/components/site/SectionDeco";

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
    <section id="reviews" className="relative overflow-hidden bg-section-sky py-16 sm:py-24">
      <SectionDeco />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Testimonials"
            title="Patient Reviews"
            accent="What Our Patients Say"
            subtitle="See what patients have shared about their experience and care."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mx-auto mt-8 flex w-fit flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-card px-6 py-3.5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft">
            <div className="flex items-center gap-2.5">
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
        </Reveal>

        {showAll && canExpand ? (
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            {(reviews ?? []).map((review, index) => (
              <Reveal key={review.id} delay={index * 60}>
                <div className="flex items-start gap-4 rounded-3xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft sm:p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-base font-bold text-primary ring-1 ring-primary/10">
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
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {isLoading ? (
              <div className="flex w-full justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleReviews.length > 0 ? (
              visibleReviews.map((review, index) => (
                <Reveal
                  key={review.id}
                  delay={index * 80}
                  className="w-full md:w-[calc(33.333%-0.667rem)]"
                >
                  <div className="group relative h-full overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99]">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    />
                    <Quote
                      aria-hidden
                      className="absolute -right-2 -top-2 h-16 w-16 text-primary/[0.07] transition-colors duration-300 group-hover:text-primary/[0.12]"
                    />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="flex gap-1">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-current text-yellow-500" />
                        ))}
                      </div>

                      <MessageCircle className="h-5 w-5 text-primary/40" />
                    </div>

                    <p className="relative mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                      "{review.text}"
                    </p>

                    <div className="relative mt-5 flex items-center gap-3 border-t border-dashed border-border pt-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                        {(review.name || "P").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-foreground sm:text-sm">
                          {review.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Google Review</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))
            ) : (
              <p className="w-full py-8 text-center text-sm text-muted-foreground">
                No reviews yet.
              </p>
            )}
          </div>
        )}

        <Reveal delay={80}>
          <div className="mt-7 flex justify-center">
            <a
              href="https://maps.app.goo.gl/43SpKFecmwH9AfoD8"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-glass active:scale-[0.97]"
            >
              View All Reviews on Google
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mx-auto mt-10 max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
            <div className="p-6">
              <h3 className="font-display text-lg font-semibold text-primary">
                Share Your Experience
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Reviews are approved before appearing on the site.
              </p>

              {done ? (
                <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <p className="text-sm font-semibold text-foreground">
                    Thank you for your review!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    It will appear on the site once approved.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setDone(false)}
                  >
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
                            star <= rating
                              ? "fill-current text-yellow-500"
                              : "text-muted-foreground/40"
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
        </Reveal>
      </div>
    </section>
  );
}
