import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Search as SearchIcon, ArrowRight, SearchX, AlertTriangle } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/hooks/queries/useSiteExtra";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — Dr. Naseem Ahmed Khan" },
      {
        name: "description",
        content:
          "Search services, conditions, videos, products and FAQs on Dr. Naseem Ahmed Khan's website.",
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [query, setQuery] = useState("");
  const { data: groups, isFetching, isError } = useSearch(query);

  const searching = query.trim().length >= 2;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-bold text-foreground">Search</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find services, conditions, videos, products and answers
          </p>

          <div className="relative mt-6">
            <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search… e.g. back pain, homeopathy, video consultation"
              className="h-12 rounded-2xl pl-12 pr-10"
            />
            {isFetching && searching && (
              <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-primary" />
            )}
          </div>

          <div className="mt-8 space-y-6">
            {!searching ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search the site.
              </p>
            ) : isFetching && !groups ? (
              <div className="flex justify-center p-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="text-sm font-medium text-destructive">
                  Search failed to load results.
                </p>
                <p className="text-xs text-muted-foreground">Please try again in a moment.</p>
              </div>
            ) : (groups ?? []).every((g) => g.items.length === 0) ? (
              <div className="flex flex-col items-center gap-3 p-12 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No results for "{query}". Try different keywords.
                </p>
              </div>
            ) : (
              (groups ?? [])
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <section key={group.title}>
                    <h2 className="font-display text-lg font-semibold capitalize text-primary">
                      {group.title}
                    </h2>
                    <div className="mt-2 space-y-2">
                      {group.items.map((item) => (
                        <a
                          key={`${group.title}-${item.id}`}
                          href={item.href}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-soft transition hover:border-primary/40"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">
                              {item.label}
                            </div>
                            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                        </a>
                      ))}
                    </div>
                  </section>
                ))
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
