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
import { motion } from "framer-motion";

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
  bare = false,
}: {
  conditions: Condition[];
  page: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  value: string[];
  onValueChange: (value: string[]) => void;
  bare?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(conditions.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = conditions.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  if (loading) {
    return <p className="py-12 text-center text-sm text-white/60">Loading conditions...</p>;
  }

  if (conditions.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 py-12 text-center backdrop-blur-md">
        <p className="text-sm font-medium text-white">No conditions found</p>
        <p className="mt-1 text-xs text-white/60">Try a different search term or category.</p>
      </div>
    );
  }

  return (
    <>
      <Accordion
        type="multiple"
        value={value}
        onValueChange={onValueChange}
        className={cn(
          "transition-shadow duration-300 hover:shadow-lg",
          bare
            ? "overflow-hidden"
            : "overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md",
        )}
      >
        {pageItems.map((c) => (
          <AccordionItem
            key={c.id}
            value={c.id}
            className="px-5 transition-colors duration-200 first:rounded-t-3xl last:rounded-b-3xl border-b border-white/10 last:border-0"
          >
            <AccordionTrigger className="group gap-3 -mx-2 rounded-xl px-2 py-4 transition-all duration-200 hover:bg-white/10 hover:no-underline active:scale-[0.99]">
              <span className="flex flex-1 items-center gap-3 text-left pr-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                    c.category === "homeopathic"
                      ? "bg-emerald-400/20 text-emerald-400"
                      : "bg-emerald-400/10 text-emerald-300",
                  )}
                >
                  {categoryLabels[c.category]}
                </span>
                <span className="font-serif-display text-[17px] font-semibold text-white transition-colors duration-200 group-hover:text-emerald-400 sm:text-lg">
                  {c.title}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pr-2 text-[15px] leading-relaxed text-white/60 sm:text-sm italic">
              {c.description}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {totalPages > 1 && (
        <nav
          className={cn(
            "flex flex-wrap items-center justify-center gap-1.5",
            bare ? "mt-5 mr-4 ml-4 mb-3" : "mt-5",
          )}
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {getPageNumbers(totalPages, currentPage).map((n, i) =>
            n === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-white/60">
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
                    ? "bg-emerald-400 text-black shadow-sm"
                    : "border border-white/10 bg-white/5 text-white hover:-translate-y-0.5 hover:bg-white/10 active:scale-90",
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
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
    <section id="diseases" className="relative overflow-hidden bg-black">
      {/* Ambient deep teal glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-1/4 h-80 w-80 rounded-full bg-emerald-500/[0.07] blur-[130px]" />
        <div className="absolute -right-24 bottom-1/4 h-80 w-80 rounded-full bg-cyan-500/[0.06] blur-[140px]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Conditions We Treat
          </span>
          <h2 className="mt-5 font-serif-display text-4xl font-bold text-white sm:text-5xl">
            Diseases &amp;{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(52,211,153,0.3)]">
              Symptoms
            </span>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-base leading-relaxed text-white/60">
            Your Health, Our Care — explore the conditions we treat and tap any condition to read
            its details.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="mx-auto mt-12 max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-md sm:p-6 liquid-glass">
            <div ref={searchRef} className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
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
                placeholder="Search Conditions..."
                className="h-12 w-full rounded-2xl border-white/10 bg-black/50 text-white pl-10 shadow-sm transition-all duration-300 hover:border-emerald-400/40 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:border-emerald-400/40 placeholder:text-white/40"
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
                  className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/90 py-1.5 shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                  {visibleSuggestions.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-white/60">No conditions found</p>
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
                          i === activeIndex ? "bg-white/10" : "bg-transparent",
                        )}
                      >
                        <span className="min-w-0 truncate text-[15px] font-medium text-white sm:text-sm">
                          {s.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                            s.category === "homeopathic"
                              ? "bg-emerald-400/20 text-emerald-400"
                              : "bg-emerald-400/10 text-emerald-300",
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
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-white/60">
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
                      ? "border-emerald-400 bg-emerald-400 text-black shadow-sm"
                      : "border-white/10 bg-transparent text-white hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-white/10 active:scale-95",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {selected ? (
          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center">
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-white/10 active:scale-95"
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
            {/*
              Mobile (<md): compact combined presentation — both groups live in a single
              card, each with a slim category header. Filters still control which group(s)
              appear (All = both, otherwise only the selected category).
            */}
            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md md:hidden">
              {showHomeo && (
                <>
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Leaf className="h-4 w-4 text-emerald-400" />
                      <span className="text-[13px] font-semibold uppercase tracking-wide text-emerald-300">
                        Homeopathy
                      </span>
                    </span>
                    <span className="text-[11px] text-white/40">
                      {homeoConditions.length} condition
                      {homeoConditions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ConditionList
                    bare
                    conditions={homeoConditions}
                    page={homeoPage}
                    onPageChange={setHomeoPage}
                    loading={isLoading}
                    value={homeoOpen}
                    onValueChange={setHomeoOpen}
                  />
                </>
              )}
              {showPhysio && (
                <>
                  <div
                    className={cn(
                      "flex items-center justify-between border-b border-white/10 px-4 py-3",
                      showHomeo && "border-t",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-emerald-400" />
                      <span className="text-[13px] font-semibold uppercase tracking-wide text-emerald-300">
                        Physiotherapy
                      </span>
                    </span>
                    <span className="text-[11px] text-white/40">
                      {physioConditions.length} condition
                      {physioConditions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ConditionList
                    bare
                    conditions={physioConditions}
                    page={physioPage}
                    onPageChange={setPhysioPage}
                    loading={isLoading}
                    value={physioOpen}
                    onValueChange={setPhysioOpen}
                  />
                </>
              )}
            </div>

            {showHomeo && (
              <section className="mt-14 hidden md:block">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-400 ring-1 ring-emerald-400/30">
                      <Leaf className="h-6 w-6" />
                    </span>
                    <div>
                      <h4 className="font-serif-display text-[20px] font-semibold text-white sm:text-xl">
                        Symptoms &amp; Diseases Treated With Homeopathy
                      </h4>
                      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-white/60 sm:text-sm italic">
                        Individualized homeopathic care based on your symptoms and health history.
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <div className="relative mt-6 overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-4 sm:p-5 liquid-glass">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400/70 via-emerald-400/30 to-transparent"
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
                </motion.div>
              </section>
            )}

            {showPhysio && (
              <section className="mt-14 hidden md:block">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/30">
                      <Activity className="h-6 w-6" />
                    </span>
                    <div>
                      <h4 className="font-serif-display text-[20px] font-semibold text-white sm:text-xl">
                        Physiotherapy Treatment
                      </h4>
                      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-white/60 sm:text-sm italic">
                        Professional physiotherapy for pain relief, rehabilitation and better
                        mobility.
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <div className="relative mt-6 overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-4 sm:p-5 liquid-glass">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400/70 via-emerald-400/30 to-transparent"
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
                </motion.div>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
