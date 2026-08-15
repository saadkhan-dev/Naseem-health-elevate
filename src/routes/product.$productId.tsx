import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Zap,
  Star,
  ShieldCheck,
  Truck,
  ArrowLeft,
  Check,
} from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/admin/QueryError";
import {
  useProductDetail,
  useProductReviews,
  useSubmitProductReview,
} from "@/hooks/queries/useShop";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { todayInClinic } from "@/lib/clinic";
import {
  productEffectivePrice,
  productDiscountPercent,
  productOfferLabel,
  isProductOfferActive,
  isProductOrderable,
} from "@/lib/product-offer-types";

export const Route = createFileRoute("/product/$productId")({
  head: () => ({
    meta: [
      { title: "Product — Dr. Naseem Ahmed Khan" },
      { name: "description", content: "View product details and order online." },
    ],
  }),
  component: ProductDetail,
});

function ProductDetail() {
  const { productId } = Route.useParams();
  const { data: product, isLoading, isError, error } = useProductDetail(productId);
  const { data: reviews, isLoading: reviewsLoading } = useProductReviews(productId);
  const cart = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const submitReview = useSubmitProductReview();
  const today = todayInClinic();

  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewDone, setReviewDone] = useState(false);

  const price = product ? productEffectivePrice(product, today) : 0;
  const hasDiscount = product != null && isProductOfferActive(product, today);
  const orderable = product != null && isProductOrderable(product);
  const maxQty =
    product && typeof product.stock_quantity === "number"
      ? Math.max(1, Math.min(50, product.stock_quantity))
      : 50;

  function handleAdd() {
    if (!product) return;
    cart.add(product.id, qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  }

  function handleBuyNow() {
    if (!product) return;
    cart.add(product.id, qty);
    router.navigate({ to: "/checkout" });
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setReviewError("");
    try {
      const result = await submitReview.mutateAsync({
        productId: product.id,
        rating,
        comment,
      });
      if (result.error) {
        setReviewError(result.error);
        return;
      }
      setReviewDone(true);
      setComment("");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not submit your review.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-6xl">
          <Link
            to="/shop"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to shop
          </Link>

          {isError && (
            <div className="mt-4">
              <QueryError error={error} />
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : product ? (
            <div className="mt-4 grid gap-8 lg:grid-cols-2">
              {/* Image */}
              <div className="overflow-hidden rounded-3xl border border-border bg-card">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-sm text-muted-foreground">
                    No image
                  </div>
                )}
              </div>

              {/* Details */}
              <div>
                {product.category && (
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {product.category}
                  </div>
                )}
                <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
                  {product.name}
                </h1>

                <div className="mt-2 flex items-center gap-3">
                  <span className="flex items-center gap-1 text-sm text-foreground">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">
                      {product.rating_count > 0 ? Number(product.rating_avg).toFixed(1) : "—"}
                    </span>
                    <span className="text-muted-foreground">
                      ({product.rating_count} review{product.rating_count === 1 ? "" : "s"})
                    </span>
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-primary">
                    Rs. {price.toLocaleString()}
                  </span>
                  {hasDiscount && (
                    <span className="text-lg font-medium text-muted-foreground line-through">
                      Rs. {Number(product.price).toLocaleString()}
                    </span>
                  )}
                </div>

                {product && isProductOfferActive(product, today) && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                    {productOfferLabel(product)}
                    {productDiscountPercent(product) != null && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px]">
                        {productDiscountPercent(product)}% OFF
                      </span>
                    )}
                  </div>
                )}

                {product.description && (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                )}

                {typeof product.stock_quantity === "number" && (
                  <div
                    className={`mt-3 text-xs font-medium ${
                      product.stock_quantity > 0 ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {product.stock_quantity > 0
                      ? `${product.stock_quantity} in stock`
                      : "Currently out of stock"}
                  </div>
                )}

                {orderable ? (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-card px-1">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          aria-label="Decrease quantity"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-foreground">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                          aria-label="Increase quantity"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <Button
                        onClick={handleAdd}
                        className="flex-1 gap-2"
                        disabled={added}
                        variant={added ? "outline" : "default"}
                      >
                        {added ? (
                          <>
                            <Check className="h-4 w-4" /> Added to cart
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="h-4 w-4" /> Add to Cart
                          </>
                        )}
                      </Button>
                    </div>
                    <Button onClick={handleBuyNow} variant="outline" className="w-full gap-2">
                      <Zap className="h-4 w-4 text-primary" /> Buy Now
                    </Button>

                    <div className="grid gap-2 pt-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                        <ShieldCheck className="h-4 w-4 text-primary" /> Verified by the clinic
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                        <Truck className="h-4 w-4 text-primary" /> Delivery available
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                        <Star className="h-4 w-4 text-primary" /> Quality products
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This product is currently out of stock. Please contact the clinic.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Reviews */}
          {product && (
            <section className="mt-12">
              <h2 className="font-display text-2xl font-bold text-foreground">Customer Reviews</h2>

              {reviewsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (reviews ?? []).length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  No reviews yet. Be the first to review this product.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {(reviews ?? []).map((r) => (
                    <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < r.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-sm font-semibold text-foreground">
                            {r.name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {r.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Review form */}
              {user ? (
                <div className="mt-8 rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    Write a review
                  </h3>
                  {reviewDone ? (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      <Check className="mt-0.5 h-4 w-4" />
                      <span>
                        Thank you! Your review has been submitted and will appear once approved by
                        the clinic.
                      </span>
                    </div>
                  ) : (
                    <form onSubmit={handleReviewSubmit} className="mt-4 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">
                          Rating
                        </label>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setRating(i + 1)}
                              aria-label={`Rate ${i + 1} star${i === 0 ? "" : "s"}`}
                              className="p-0.5"
                            >
                              <Star
                                className={`h-6 w-6 transition ${
                                  i < rating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">
                          Your review
                        </label>
                        <Input
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Share your experience with this product…"
                        />
                      </div>
                      {reviewError && (
                        <p className="text-sm font-medium text-destructive">{reviewError}</p>
                      )}
                      <Button type="submit" disabled={submitReview.isPending || !comment.trim()}>
                        {submitReview.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Submit review
                      </Button>
                    </form>
                  )}
                </div>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  <Link to="/" className="font-medium text-primary hover:underline">
                    Sign in
                  </Link>{" "}
                  to write a review.
                </p>
              )}
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
