import { Star, MessageCircle, Loader2 } from "lucide-react";
import { useReviews } from "@/hooks/queries/useContent";

export function ReviewsSection() {
  const { data: reviews, isLoading } = useReviews();

  return (
    <section id="reviews" className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold text-red-600 sm:text-5xl">
            Patient Reviews
          </h2>

          <h3 className="mt-3 font-display text-xl font-semibold text-primary sm:text-2xl">
            What Our Patients Say
          </h3>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            See what patients have shared about their experience and care.
          </p>
        </div>

        <div className="mx-auto mt-7 flex w-fit items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className="h-5 w-5 fill-current text-yellow-500" />
            ))}
          </div>

          <div className="h-5 w-px bg-border" />

          <div>
            <p className="text-sm font-semibold text-foreground">Google Reviews</p>
            <p className="text-xs text-muted-foreground">Patient feedback</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {isLoading ? (
            <div className="flex w-full justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : reviews && reviews.length > 0 ? (
            reviews.map((review) => (
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

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  "{review.text}"
                </p>

                <p className="mt-5 text-sm font-semibold text-foreground">{review.name}</p>

                <p className="mt-1 text-xs text-muted-foreground">Google Review</p>
              </div>
            ))
          ) : (
            <p className="w-full py-8 text-center text-sm text-muted-foreground">No reviews yet.</p>
          )}
        </div>

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
      </div>
    </section>
  );
}
