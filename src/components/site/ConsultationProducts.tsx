import { Check, Video, ShoppingCart, Loader2, ArrowRight, Ban } from "lucide-react";
import { Link } from "@tanstack/react-router";
import consultationImg from "@/assets/consultation.jpg";
import { usePublishedProducts, usePublicVideoOffers } from "@/hooks/queries/useContent";
import { useServices } from "@/hooks/queries/useBookings";
import { isVideoConsultationService } from "@/lib/bookings";
import { VideoOfferCards } from "@/components/site/VideoOfferCards";
import { useCart } from "@/lib/cart";
import { todayInClinic } from "@/lib/clinic";
import {
  productEffectivePrice,
  productOfferLabel,
  isProductOfferActive,
  isProductOrderable,
} from "@/lib/product-offer-types";

export function ConsultationProducts() {
  const { data: products, isLoading } = usePublishedProducts();
  const { data: offers } = usePublicVideoOffers();
  const { data: services } = useServices();
  const videoServicePrice = services?.find(isVideoConsultationService)?.price;
  const cart = useCart();
  const today = todayInClinic();

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        <div
          id="video-consultation"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft active:scale-[0.99] md:p-8"
        >
          <div className="grid items-center gap-5 sm:grid-cols-2">
            <div className="text-center sm:text-left">
              <h3 className="font-display text-2xl font-bold text-red-600">Video Consultation</h3>
              <p className="mt-2 text-[15px] text-muted-foreground sm:text-sm">
                Consult with Dr. Naseem Ahmed Khan from the comfort of your home.
              </p>
              <ul className="mt-4 space-y-2 text-[15px] text-left sm:text-sm">
                {[
                  "Secure & private sessions",
                  "One-on-one video consultation",
                  "Personalized treatment guidance",
                  "Convenient & time-saving",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-foreground">
                    <Check className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/booking"
                search={{ mode: "video" }}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-[15px] font-semibold text-primary-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-soft active:scale-95 sm:text-sm"
              >
                <Video className="h-4 w-4" /> Consult Now
              </Link>
              <VideoOfferCards
                offers={offers ?? []}
                basePrice={videoServicePrice}
                className="mt-4 text-left"
              />
            </div>
            <div className="group overflow-hidden rounded-2xl bg-primary-soft">
              <img
                src={consultationImg}
                alt="Video consultation"
                loading="lazy"
                width={900}
                height={900}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
          </div>
        </div>

        <div
          id="products"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft active:scale-[0.99] md:p-8"
        >
          <div className="mb-5 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:text-left">
            <div>
              <h3 className="font-display text-2xl font-bold text-red-600">
                Our Homeopathic Products
              </h3>
              <p className="mt-1 text-[15px] text-muted-foreground sm:text-sm">
                Safe, natural & effective products for better health.
              </p>
            </div>
            <Link
              to="/shop"
              className="inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold text-primary transition-colors hover:text-primary/80 sm:text-sm"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : products?.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No products available</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {products?.map((p) => (
                <Link
                  key={p.id}
                  to="/product/$productId"
                  params={{ productId: p.id }}
                  className="group rounded-2xl border border-border bg-background p-3 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft active:scale-[0.99]"
                >
                  <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        width={800}
                        height={800}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="text-[15px] font-semibold text-foreground transition-colors duration-300 group-hover:text-primary sm:text-sm">
                      {p.name}
                    </div>
                    {p.description && (
                      <div className="text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
                        {p.description}
                      </div>
                    )}
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className="text-[15px] font-bold text-primary sm:text-sm">
                        Rs. {productEffectivePrice(p, today).toLocaleString()}
                      </div>
                      {isProductOfferActive(p, today) && (
                        <div className="text-xs text-muted-foreground line-through">
                          Rs. {Number(p.price).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {productOfferLabel(p) && (
                      <div className="mt-1 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 sm:text-[10px]">
                        {productOfferLabel(p)}
                      </div>
                    )}
                    {isProductOrderable(p) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          cart.add(p.id, 1);
                        }}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-soft py-2 text-[13px] font-semibold text-primary transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:shadow-sm active:scale-95 sm:text-xs"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                      </button>
                    ) : (
                      <div className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-muted py-2 text-[13px] font-semibold text-muted-foreground sm:text-xs">
                        <Ban className="h-3.5 w-3.5" /> Out of stock
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
