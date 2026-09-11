import { ShoppingCart, Loader2, ArrowRight, Ban, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePublishedProducts } from "@/hooks/queries/useContent";
import { useCart } from "@/lib/cart";
import { todayInClinic } from "@/lib/clinic";
import {
  productEffectivePrice,
  productOfferLabel,
  isProductOfferActive,
  isProductOrderable,
} from "@/lib/product-offer-types";
import { motion } from "framer-motion";

export function ConsultationProducts() {
  const { data: products, isLoading } = usePublishedProducts();
  const cart = useCart();
  const today = todayInClinic();

  return (
    <section className="relative overflow-hidden bg-black px-4 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div
            id="products"
            className="group/card relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur-md liquid-glass transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 active:scale-[0.99] md:p-8"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent opacity-0 transition-opacity duration-500 group-hover/card:opacity-100"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover/card:opacity-100"
            />
            <div className="relative mb-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:text-left">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.25)]">
                  <Sparkles className="h-3 w-3" />
                  Natural Remedies
                </span>
                <h3 className="mt-3 font-serif-display text-2xl font-bold text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.15)] sm:text-3xl">
                  Our Homeopathic Products
                </h3>
                <p className="mt-1.5 text-[15px] text-white/60 sm:text-sm">
                  Safe, natural &amp; effective products for better health.
                </p>
              </div>
              <Link
                to="/shop"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[15px] font-semibold text-emerald-400 transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-400 hover:text-black active:scale-95 sm:text-sm"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {isLoading ? (
              <div className="relative flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
              </div>
            ) : products?.length === 0 ? (
              <p className="relative py-8 text-center text-sm text-white/60">
                No products available
              </p>
            ) : (
              <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-3">
                {products?.map((p) => (
                  <Link
                    key={p.id}
                    to="/product/$productId"
                    params={{ productId: p.id }}
                    className="group rounded-2xl border border-white/10 bg-black/40 p-3 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-white/5 active:scale-[0.99]"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-white/5">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          width={800}
                          height={800}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-white/40">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="text-[15px] font-semibold text-white transition-colors duration-300 group-hover:text-emerald-400 sm:text-sm">
                        {p.name}
                      </div>
                      {p.description && (
                        <div className="text-[13px] leading-relaxed text-white/60 sm:text-xs">
                          {p.description}
                        </div>
                      )}
                      <div className="mt-1 flex items-baseline gap-2">
                        <div className="text-[15px] font-bold text-emerald-400 sm:text-sm">
                          Rs. {productEffectivePrice(p, today).toLocaleString()}
                        </div>
                        {isProductOfferActive(p, today) && (
                          <div className="text-xs text-white/40 line-through">
                            Rs. {Number(p.price).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {productOfferLabel(p) && (
                        <div className="mt-1 inline-flex items-center rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 sm:text-[10px]">
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
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-[13px] font-semibold text-emerald-400 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-400 hover:text-black active:scale-95 sm:text-xs"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                        </button>
                      ) : (
                        <div className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-[13px] font-semibold text-white/40 sm:text-xs border border-white/10">
                          <Ban className="h-3.5 w-3.5" /> Out of stock
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
