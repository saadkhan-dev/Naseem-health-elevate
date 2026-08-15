import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ShoppingCart, Star, Zap, PackageX, Check, Ban } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/admin/QueryError";
import { usePublishedProducts } from "@/hooks/queries/useContent";
import { useCart } from "@/lib/cart";
import { todayInClinic } from "@/lib/clinic";
import {
  productEffectivePrice,
  productOfferLabel,
  isProductOfferActive,
  isProductOrderable,
} from "@/lib/product-offer-types";
import type { Product } from "@/lib/admin-data";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop Products — Dr. Naseem Ahmed Khan" },
      { name: "description", content: "Browse and order homeopathic products online." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { data: products, isLoading, isError, error } = usePublishedProducts();
  const cart = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);
  const today = todayInClinic();

  const categories = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
    });
  }, [products, category, search]);

  function handleAdd(p: Product) {
    cart.add(p.id, 1);
    setAddedId(p.id);
    window.setTimeout(() => setAddedId((prev) => (prev === p.id ? null : prev)), 1500);
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Products & Homeopathic Medicine</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Safe, natural & effective products for better health — order online.
              </p>
            </div>
            <Link
              to="/cart"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition hover:brightness-[1.05]"
            >
              <ShoppingCart className="h-4 w-4" />
              Cart
              {cart.count > 0 && (
                <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs">
                  {cart.count}
                </span>
              )}
            </Link>
          </div>

          {isError && (
            <div className="mt-6">
              <QueryError error={error} />
            </div>
          )}

          {/* Filters */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                category === "all"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                {c}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="ml-auto h-10 w-full max-w-xs rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary/50"
            />
          </div>

          <div className="mt-6">
            {isLoading ? (
              <div className="flex justify-center p-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <PackageX className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No products match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    className="group flex flex-col rounded-2xl border border-border bg-card p-3 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30"
                  >
                    <Link to="/product/$productId" params={{ productId: p.id }} className="block">
                      <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="mt-3 px-1">
                        {p.category && (
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                            {p.category}
                          </div>
                        )}
                        <div className="mt-0.5 text-sm font-semibold text-foreground group-hover:text-primary">
                          {p.name}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-medium text-foreground">
                            {p.rating_count > 0 ? Number(p.rating_avg).toFixed(1) : "New"}
                          </span>
                          <span>({p.rating_count})</span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-base font-bold text-primary">
                            Rs. {productEffectivePrice(p, today).toLocaleString()}
                          </span>
                          {isProductOfferActive(p, today) && (
                            <span className="text-xs text-muted-foreground line-through">
                              Rs. {Number(p.price).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {productOfferLabel(p) && (
                          <div className="mt-1 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                            {productOfferLabel(p)}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="mt-3 flex gap-2">
                      {isProductOrderable(p) ? (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => handleAdd(p)}
                            disabled={addedId === p.id}
                          >
                            {addedId === p.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <ShoppingCart className="h-3.5 w-3.5" />
                            )}
                            {addedId === p.id ? "Added" : "Add"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => {
                              cart.add(p.id, 1);
                              window.location.href = "/checkout";
                            }}
                          >
                            <Zap className="h-3.5 w-3.5 text-primary" /> Buy
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className="flex-1 gap-1.5 text-muted-foreground"
                        >
                          <Ban className="h-3.5 w-3.5" /> Out of stock
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
