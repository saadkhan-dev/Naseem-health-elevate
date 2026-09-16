import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Loader2,
  Search as SearchIcon,
  ArrowRight,
  SearchX,
  AlertTriangle,
  Truck,
} from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/admin/QueryError";
import { usePublishedProducts } from "@/hooks/queries/useContent";
import type { Product } from "@/lib/admin-data";
import { productEffectivePrice, productOfferLabel } from "@/lib/product-offer-types";
import { productDeliveryLabel } from "@/lib/delivery";
import { todayInClinic } from "@/lib/clinic";
import { z } from "zod";

export const Route = createFileRoute("/search")({
  validateSearch: z.object({
    q: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      { title: "Search Products | Rahat Homeo Physio Clinic" },
      {
        name: "description",
        content:
          "Search the homeopathic medicines and health products at Rahat Homeo Physio Clinic in Karachi.",
      },
    ],
  }),
  component: SearchPage,
});

const SUGGESTION_MAX = 6;

function SearchPage() {
  const { q: initialQuery } = Route.useSearch();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const navigate = useNavigate();
  const { data: products, isLoading, isError, error } = usePublishedProducts();
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayInClinic();

  const queryLower = query.trim().toLowerCase();
  const hasQuery = queryLower.length > 0;

  const filtered = useMemo(() => {
    const all = products ?? [];
    if (!hasQuery) return all;
    return all.filter((p) =>
      [p.name, p.category, p.description, p.pack_size, p.product_condition]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(queryLower)),
    );
  }, [products, hasQuery, queryLower]);

  const suggestions = useMemo(() => {
    if (!hasQuery) return [];
    const scored = (products ?? [])
      .map((p) => {
        let score = 0;
        if (p.name.toLowerCase() === queryLower) score += 100;
        else if (p.name.toLowerCase().startsWith(queryLower)) score += 60;
        else if (p.name.toLowerCase().includes(queryLower)) score += 30;
        if (p.category && p.category.toLowerCase().includes(queryLower)) score += 15;
        if (p.description && p.description.toLowerCase().includes(queryLower)) score += 10;
        return { product: p, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.product);
    return scored.slice(0, SUGGESTION_MAX);
  }, [products, hasQuery, queryLower]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuggestionsOpen(false);
    const q = query.trim();
    void navigate({ to: "/search", search: q ? { q } : {} } as never);
  }

  function handleChange(val: string) {
    setQuery(val);
    if (val.trim().length > 0) {
      void navigate({
        to: "/search",
        search: { q: val.trim() },
        replace: true,
      } as never);
    }
  }

  function applySuggestion(name: string) {
    setQuery(name);
    setSuggestionsOpen(false);
    inputRef.current?.blur();
    void navigate({ to: "/search", search: { q: name } } as never);
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="font-display text-3xl font-bold text-foreground">Search Products</h1>
          <p className="mt-1 text-[15px] text-muted-foreground sm:text-sm">
            Search for homeopathic medicines and health products by name, category or description,
            then buy them online from the clinic.
          </p>

          {isError && (
            <div className="mt-4">
              <QueryError error={error} />
            </div>
          )}

          <div className="relative mt-6">
            <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <form onSubmit={handleSubmit} role="search">
              <Input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  handleChange(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => hasQuery && setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
                placeholder="Search medicines, supplements, categories…"
                className="h-12 rounded-2xl pl-12 pr-10"
                aria-label="Search products"
                aria-expanded={suggestions && suggestions.length > 0}
              />
            </form>
            {isLoading && (
              <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-primary" />
            )}

            {suggestionsOpen && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggestions
                </div>
                <ul className="divide-y divide-border/60">
                  {suggestions.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applySuggestion(p.name);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted"
                      >
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
                            No img
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {p.name}
                          </span>
                          {p.category && (
                            <span className="block truncate text-xs capitalize text-muted-foreground">
                              {p.category}
                              {p.pack_size ? ` · ${p.pack_size}` : ""}
                            </span>
                          )}
                        </span>
                        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-8">
            {isLoading ? (
              <div className="flex justify-center p-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="text-[15px] font-medium text-destructive sm:text-sm">
                  Search failed to load results.
                </p>
                <p className="text-[13px] text-muted-foreground sm:text-xs">
                  Please try again in a moment.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground" />
                <p className="text-[15px] font-medium text-foreground sm:text-sm">
                  No products found{hasQuery ? ` for "${query.trim()}"` : ""}
                </p>
                <p className="text-[13px] text-muted-foreground sm:text-xs">
                  {hasQuery
                    ? "Try different keywords or check the full product range below."
                    : "There are no products available right now. Please check back soon."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} today={today} />
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

function ProductCard({ product, today }: { product: Product; today: string }) {
  return (
    <Link
      to="/product/$productId"
      params={{ productId: product.id }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/30"
    >
      <div className="aspect-square overflow-hidden rounded-t-2xl bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col px-5 py-4">
        {product.category && (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {product.category}
          </div>
        )}
        <div className="mt-0.5 text-[15px] font-semibold text-foreground group-hover:text-primary sm:text-sm">
          {product.name}
        </div>
        {product.pack_size && (
          <div className="mt-0.5 text-xs text-muted-foreground">{product.pack_size}</div>
        )}
        {product.description && (
          <div className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground sm:text-xs">
            {product.description}
          </div>
        )}
        {productDeliveryLabel(product) && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Truck className="h-3 w-3" />
            {productDeliveryLabel(product)}
          </div>
        )}
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-3">
          <span className="text-[17px] font-bold text-primary sm:text-base">
            Rs. {productEffectivePrice(product, today).toLocaleString()}
          </span>
          {productOfferLabel(product) && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
              {productOfferLabel(product)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
