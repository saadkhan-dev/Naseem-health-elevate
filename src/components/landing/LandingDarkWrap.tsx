import type { ReactNode } from "react";

export function LandingDarkWrap({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={`bg-black px-6 py-16 md:py-24 ${className} landing-dark-panel [&_.text-muted-foreground]:text-white/50 [&_.text-foreground]:text-white [&_.text-red-600]:text-white [&_.text-primary]:text-emerald-400 [&_.border-border]:border-white/10 [&_.bg-card]:bg-white/[0.03] [&_.bg-card\/90]:bg-white/[0.05] [&_.bg-background]:bg-transparent [&_.bg-muted]:bg-white/5 [&_.bg-muted\/40]:bg-white/5 [&_.bg-section-sky]:bg-transparent [&_.bg-section-teal]:bg-transparent [&_.bg-section-soft]:bg-transparent [&_.shadow-soft]:shadow-none [&_.shadow-card]:shadow-none [&_.font-display]:font-serif-display [&_.bg-primary-soft]:bg-emerald-400/10 [&_.text-primary-foreground]:text-black [&_.bg-gradient-primary]:bg-emerald-500 [&_.bg-primary]:bg-emerald-500 [&_.text-sky-600]:text-cyan-400 [&_.text-sky-700]:text-cyan-300 [&_.bg-sky-100]:bg-cyan-400/15 [&_.bg-red-50]:bg-emerald-400/10 [&_.text-red-600]:text-emerald-400 [&_.ring-primary\/10]:ring-emerald-400/10 [&_.ring-sky-500\/10]:ring-cyan-400/10 [&_.border-primary\/10]:border-emerald-400/10 [&_.border-sky-500\/10]:border-cyan-400/10 [&_.from-primary\/15]:from-emerald-400/15 [&_.from-primary\/\[0.06\]]:from-emerald-400/[0.06] [&_.from-sky-500\/15]:from-cyan-400/15 [&_.from-sky-500\/\[0.07\]]:from-cyan-400/[0.07] [&_.from-primary\/70]:from-emerald-400/70 [&_.from-primary\/30]:from-emerald-400/30 [&_.from-sky-500\/70]:from-cyan-400/70 [&_.from-sky-500\/30]:from-cyan-400/30 [&_.hover\:bg-muted]:hover:bg-white/5 [&_.hover\:text-primary]:hover:text-emerald-400 [&_.focus-visible\:ring-primary\/40]:focus-visible:ring-emerald-400/40 [&_.hover\:border-primary\/40]:hover:border-emerald-400/40 [&_.focus-visible\:border-primary\/40]:focus-visible:border-emerald-400/40`}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
