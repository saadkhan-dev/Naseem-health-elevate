import * as React from "react";
import { Search, X, ChevronLeft, ChevronRight, Leaf, Activity, Filter } from "lucide-react";
import { useConditions } from "@/hooks/queries/useContent";
import type { Condition, ConditionCategory } from "@/lib/site-content";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Reveal } from "@/components/site/Reveal";
import { SectionDeco } from "@/components/site/SectionDeco";

const PER_PAGE = 6;
const MAX_SUGGESTIONS = 8;

const categoryLabels: Record<ConditionCategory, string> = {
  homeopathic: "Homeopathy",
  physiotherapy: "Physiotherapy",
};

type CategoryFilter = "all" | ConditionCategory;

const filterOptions: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "homeopathic", label: "Homeopathy" },
  { value: "physiotherapy", label: "Physiotherapy" },
];

function matchesQuery(condition: Condition, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    condition.title.toLowerCase().includes(q) || condition.description.toLowerCase().includes(q)
  );
}

function getBestMatch(conditions: Condition[], query: string): Condition | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  let best: Condition | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of conditions) {
    const title = c.title.toLowerCase();
    const description = c.description.toLowerCase();
    let score: number;
    if (title === q) score = 0;
    else if (title.startsWith(q)) score = 1;
    else if (title.includes(q)) score = 2;
    else if (description.includes(q)) score = 3;
    else score = Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function getPageNumbers(totalPages: number, current: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push("...");
  pages.push(totalPages);
  return pages;
}

function ConditionList({
  conditions,
  page,
  onPageChange,
  loading,
  value,
  onValueChange,
}: {
  conditions: Condition[];
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  value: string[];
  onValueChange: (value: string[]) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(conditions.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = conditions.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  if (loading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading conditions...</p>;
  }

  if (conditions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card py-12 text-center shadow-card">
        <p className="text-sm font-medium text-foreground">No conditions found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try a different search term or category.
        </p>
      </div>
    );
  }

  return (
    <>
      <Accordion
        type="multiple"
        value={value}
        onValueChange={onValueChange}
        className="overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-shadow duration-300 hover:shadow-soft"
      >
        {pageItems.map((c) => (
          <AccordionItem
            key={c.id}
            value={c.id}
            className="px-5 transition-colors duration-200 first:rounded-t-3xl last:rounded-b-3xl last:border-0"
          >
            <AccordionTrigger className="group gap-3 -mx-2 rounded-xl px-2 py-4 transition-all duration-200 hover:bg-muted/40 hover:no-underline active:scale-[0.99]">
              <span className="flex flex-1 items-center gap-3 text-left pr-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                    c.category === "homeopathic"
                      ? "bg-primary-soft text-primary"
                      : "bg-sky-100 text-sky-700",
                  )}
                >
                  {categoryLabels[c.category]}
                </span>
                <span className="font-display text-[17px] font-semibold text-foreground transition-colors duration-200 group-hover:text-primary sm:text-lg">
                  {c.title}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pr-2 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
              {c.description}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {totalPages > 1 && (
        <nav
          className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-muted hover:shadow-sm active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {getPageNumbers(totalPages, currentPage).map((n, i) =>
            n === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                &hellip;
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPageChange(n)}
                className={cn(
                  "h-9 w-9 rounded-full text-sm font-medium transition-all duration-300",
                  n === currentPage
                    ? "bg-gradient-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-foreground hover:-translate-y-0.5 hover:bg-muted hover:shadow-sm active:scale-90",
                )}
                aria-label={`Page ${n}`}
                aria-current={n === currentPage ? "page" : undefined}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-muted hover:shadow-sm active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </>
  );
}

export function DiseasesSection() {
  const { data: homeopathic, isLoading: homeoLod } = useConditions("homeopathic");
  const { data: physiotherapy, isLoading: physioLoading } = useConditions("physiotherapy");
  const isLoading = homeoLod || physioLoading;

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<CategoryFilter>("all");
  const [homeoPage, setHomeoPage] = React.useState(1);
  const [physioPage, setPhysioPage] = React.useState(1);
  const [homeoOpen, setHomeoOpen] = React.useState<string[]>([]);
  const [physioOpen, setPhysioOpen] = React.useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [selected, setSelected] = React.useState<Condition | null>(null);

  const searchRef = React.useRef<HTMLDivElement>(null);

  const allConditions = React.useMemo<Condition[]>(
    () => [...(homeopathic ?? []), ...(physiotherapy ?? [])],
    [homeopathic, physiotherapy],
  );

  const homeoConditions = React.useMemo(
    () => (homeopathic ?? []).filter((c) => matchesQuery(c, query)),
    [homeopathic, query],
  );
  const physioConditions = React.useMemo(
    () => (physiotherapy ?? []).filter((c) => matchesQuery(c, query)),
    [physiotherapy, query],
  );

  const searchableConditions = React.useMemo(() => {
    if (filter === "homeopathic") return homeoConditions;
    if (filter === "physiotherapy") return physioConditions;
    return [...homeoConditions, ...physioConditions];
  }, [filter, homeoConditions, physioConditions]);

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allConditions.filter(
      (c) => (filter === "all" || c.category === filter) && matchesQuery(c, query),
    );
  }, [allConditions, filter, query]);

  const visibleSuggestions = suggestions.slice(0, MAX_SUGGESTIONS);

  React.useEffect(() => {
    setHomeoPage(1);
    setPhysioPage(1);
  }, [query, filter]);

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectSuggestion(condition: Condition) {
    const isHomeo = condition.category === "homeopathic";
    const list = isHomeo ? homeoConditions : physioConditions;
    const indexInList = list.findIndex((c) => c.id === condition.id);
    if (indexInList >= 0) {
      const targetPage = Math.floor(indexInList / PER_PAGE) + 1;
      if (isHomeo) {
        setHomeoPage(targetPage);
        setHomeoOpen((prev) => (prev.includes(condition.id) ? prev : [...prev, condition.id]));
      } else {
        setPhysioPage(targetPage);
        setPhysioOpen((prev) => (prev.includes(condition.id) ? prev : [...prev, condition.id]));
      }
    }
    setSelected(condition);
    setDropdownOpen(false);
    setActiveIndex(-1);
  }

  function clearSearch() {
    setSelected(null);
    setQuery("");
    setActiveIndex(-1);
    setDropdownOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      let target: Condition | undefined;
      if (visibleSuggestions.length > 0) {
        target =
          activeIndex >= 0
            ? visibleSuggestions[activeIndex]
            : getBestMatch(searchableConditions, query);
      }
      if (target) {
        selectSuggestion(target);
      } else {
        setDropdownOpen(false);
        setActiveIndex(-1);
      }
      return;
    }
    if (visibleSuggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDropdownOpen(true);
      setActiveIndex((i) => (i + 1) % visibleSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? visibleSuggestions.length - 1 : i - 1));
    } else if (event.key === "Escape") {
      setDropdownOpen(false);
      setActiveIndex(-1);
    }
  }

  const showHomeo = filter === "all" || filter === "homeopathic";
  const showPhysio = filter === "all" || filter === "physiotherapy";
  const showDropdown = dropdownOpen && query.trim().length > 0;

  const selectedOpen = selected
    ? selected.category === "homeopathic"
      ? homeoOpen
      : physioOpen
    : [];
  const selectedOnValueChange = selected
    ? selected.category === "homeopathic"
      ? setHomeoOpen
      : setPhysioOpen
    : () => {};

  return (
    <section id="diseases" className="relative overflow-hidden bg-section-soft py-16 sm:py-24">
      <SectionDeco />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Conditions We Treat"
            title="Diseases & Symptoms"
            accent="Your Health, Our Care"
            subtitle="Explore the conditions we treat — tap any condition to read its details."
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="mx-auto mt-12 max-w-3xl rounded-3xl border border-border bg-card/90 p-4 shadow-card backdrop-blur-sm sm:p-6">
            <div ref={searchRef} className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setActiveIndex(-1);
                  setDropdownOpen(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (query.trim()) setDropdownOpen(true);
                }}
                placeholder="Search Homeopathic or Physiotherapy Conditions..."
                className="h-12 w-full rounded-2xl border-border bg-background pl-10 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40"
                role="combobox"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
                aria-controls="condition-suggestions"
                aria-activedescendant={
                  activeIndex >= 0 ? `condition-option-${activeIndex}` : undefined
                }
              />

              {showDropdown && (
                <div
                  id="condition-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-auto rounded-2xl border border-border bg-card py-1.5 shadow-soft animate-in fade-in zoom-in-95 duration-150"
                >
                  {visibleSuggestions.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No conditions found</p>
                  ) : (
                    visibleSuggestions.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        id={`condition-option-${i}`}
                        aria-selected={i === activeIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSuggestion(s);
                        }}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-150 active:scale-[0.99]",
                          i === activeIndex ? "bg-muted" : "bg-card",
                        )}
                      >
                        <span className="min-w-0 truncate text-[15px] font-medium text-foreground sm:text-sm">
                          {s.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                            s.category === "homeopathic"
                              ? "bg-primary-soft text-primary"
                              : "bg-sky-100 text-sky-700",
                          )}
                        >
                          {categoryLabels[s.category]}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filter:
              </span>
              {filterOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300",
                    filter === value
                      ? "border-primary bg-gradient-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background text-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted hover:shadow-sm active:scale-95",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {selected ? (
          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center">
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted hover:shadow-soft active:scale-95"
            >
              <X className="h-4 w-4" />
              Show All Conditions
            </button>
            <div className="mt-4 w-full">
              <ConditionList
                conditions={[selected]}
                page={1}
                onPageChange={() => {}}
                loading={false}
                value={selectedOpen}
                onValueChange={selectedOnValueChange}
              />
            </div>
          </div>
        ) : (
          <>
            {showHomeo && (
              <section className="mt-14">
                <Reveal>
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
                      <Leaf className="h-6 w-6" />
                    </span>
                    <div>
                      <h4 className="font-display text-[20px] font-semibold text-foreground sm:text-xl">
                        Symptoms &amp; Diseases Treated With Homeopathy
                      </h4>
                      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                        Personalized homeopathic consultation based on your individual symptoms,
                        health history and healthcare needs.
                      </p>
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={80}>
                  <div className="relative mt-6 overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/[0.06] to-transparent p-4 sm:p-5">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-primary/30 to-transparent"
                    />
                    <ConditionList
                      conditions={homeoConditions}
                      page={homeoPage}
                      onPageChange={setHomeoPage}
                      loading={isLoading}
                      value={homeoOpen}
                      onValueChange={setHomeoOpen}
                    />
                  </div>
                </Reveal>
              </section>
            )}

            {showPhysio && (
              <section className="mt-14">
                <Reveal>
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-sky-500/5 text-sky-600 ring-1 ring-sky-500/10">
                      <Activity className="h-6 w-6" />
                    </span>
                    <div>
                      <h4 className="font-display text-[20px] font-semibold text-foreground sm:text-xl">
                        Physiotherapy Treatment
                      </h4>
                      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                        Professional physiotherapy support for pain management, rehabilitation,
                        mobility and improved physical function.
                      </p>
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={80}>
                  <div className="relative mt-6 overflow-hidden rounded-3xl border border-sky-500/10 bg-gradient-to-br from-sky-500/[0.07] to-transparent p-4 sm:p-5">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500/70 via-sky-500/30 to-transparent"
                    />
                    <ConditionList
                      conditions={physioConditions}
                      page={physioPage}
                      onPageChange={setPhysioPage}
                      loading={isLoading}
                      value={physioOpen}
                      onValueChange={setPhysioOpen}
                    />
                  </div>
                </Reveal>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
