import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  accent?: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  accent,
  subtitle,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "relative",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          <HeartPulse className="h-3.5 w-3.5" />
          {eyebrow}
        </span>
      )}
      <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-red-600 sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {accent && (
        <p className="mt-2 font-display text-xl font-semibold text-primary sm:text-2xl">{accent}</p>
      )}
      <span
        aria-hidden
        className={cn(
          "mt-4 block h-1.5 w-16 rounded-full bg-gradient-to-r from-primary via-primary/50 to-transparent",
          align === "center" && "mx-auto",
        )}
      />
      {subtitle && (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}
