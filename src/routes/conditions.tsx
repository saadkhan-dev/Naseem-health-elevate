import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2, HeartPulse, ArrowLeft } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { useConditions } from "@/hooks/queries/useContent";
import type { ConditionCategory } from "@/lib/site-content";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/conditions")({
  validateSearch: z.object({
    category: z.enum(["homeopathic", "physiotherapy"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Diseases & Conditions — Dr. Naseem Ahmed Khan" },
      {
        name: "description",
        content:
          "Learn about the diseases and conditions treated by Dr. Naseem Ahmed Khan with homeopathy and physiotherapy.",
      },
    ],
  }),
  component: ConditionsPage,
});

function ConditionsPage() {
  const { category = "homeopathic" } = Route.useSearch();
  const {
    data: conditions,
    isLoading,
    isError,
    error,
  } = useConditions(category as ConditionCategory);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HeartPulse className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                Diseases & Symptoms 
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Symptoms & Diseases treated with{" "}
                {category === "homeopathic" ? "homeopathy" : "physiotherapy"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            {(
              [
                ["homeopathic", "Homeopathic"],
                ["physiotherapy", "Physiotherapy"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                to="/conditions"
                search={{ category: value }}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  category === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {isError && (
            <div className="mt-6">
              <QueryError error={error} />
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {isLoading ? (
              <div className="flex justify-center p-10 sm:col-span-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (conditions ?? []).length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground sm:col-span-2">
                No conditions listed yet.
              </p>
            ) : (
              (conditions ?? []).map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                >
                  <h2 className="font-display text-lg font-semibold text-foreground">{c.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
