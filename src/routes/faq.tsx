import { createFileRoute } from "@tanstack/react-router";
import { Loader2, HelpCircle, ChevronDown } from "lucide-react";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { useFaqs } from "@/hooks/queries/useSiteExtra";
import { QueryError } from "@/components/admin/QueryError";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions | Rahat Homeo Physio Clinic Karachi" },
      {
        name: "description",
        content:
          "Answers to common questions about appointments, video consultations, payments and services at Rahat Homeo Physio Clinic in Karachi.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rahathomeophysioclinic.com/faq" }],
  }),
  component: FaqPage,
});

function FaqPage() {
  const { data: faqs, isLoading, isError, error } = useFaqs();

  const grouped = (faqs ?? []).reduce<Record<string, NonNullable<typeof faqs>>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HelpCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                Frequently Asked Questions
              </h1>
              <p className="mt-1 text-[15px] text-muted-foreground sm:text-sm">
                Common questions about appointments, consultations and payments
              </p>
            </div>
          </div>

          {isError && (
            <div className="mt-6">
              <QueryError error={error} />
            </div>
          )}

          <div className="mt-8 space-y-6">
            {isLoading ? (
              <div className="flex justify-center p-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (faqs ?? []).length === 0 ? (
              <p className="p-10 text-center text-[15px] text-muted-foreground sm:text-sm">
                No FAQ entries yet. Contact us below if you have a question.
              </p>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <section key={category}>
                  <h2 className="font-display text-lg font-semibold capitalize text-primary">
                    {category}
                  </h2>
                  <div className="mt-3 space-y-2">
                    {items.map((f) => (
                      <details
                        key={f.id}
                        className="group rounded-2xl border border-border bg-card shadow-soft"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                          <span className="text-[15px] font-semibold text-foreground sm:text-sm">
                            {f.question}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                          {f.answer}
                        </div>
                      </details>
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
