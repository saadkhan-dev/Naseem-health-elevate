import { cn } from "@/lib/utils";

/**
 * Lightweight decorative layer for sections. Purely presentational — layered
 * glow blobs, rings and a subtle dot-grid corner. Hidden on small screens to
 * keep mobile lightweight.
 */
export function SectionDeco({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* Glow blobs */}
      <div className="animate-float-slower absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/[0.07] blur-3xl max-sm:h-40 max-sm:w-40" />
      <div className="animate-float-slow absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-red-500/[0.05] blur-3xl max-sm:h-44 max-sm:w-44" />

      {/* Organic rings */}
      <div className="absolute right-[7%] top-10 h-20 w-20 rounded-full border border-primary/10 max-sm:hidden" />
      <div className="absolute left-[5%] bottom-14 h-14 w-14 rounded-full border border-red-500/10 max-sm:hidden" />
      <div className="absolute right-[16%] bottom-24 h-8 w-8 rounded-full bg-primary/[0.08] max-sm:hidden" />

      {/* Dot-grid corner */}
      <div className="bg-dot-grid absolute left-0 top-0 h-44 w-44 opacity-30 max-sm:h-28 max-sm:w-28" />
      <div className="bg-dot-grid absolute bottom-0 right-0 h-40 w-40 opacity-25 max-sm:h-24 max-sm:w-24" />
    </div>
  );
}
