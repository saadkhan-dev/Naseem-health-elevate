import { useEffect } from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Sparkles } from "lucide-react";
import { BookingPanel } from "@/components/site/BookingPanel";

export function LandingBookingSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    const saved = sessionStorage.getItem("landing-quick-contact");
    if (!saved) return;
    sessionStorage.removeItem("landing-quick-contact");
    const isEmail = saved.includes("@");
    const input = document.querySelector<HTMLInputElement>(
      isEmail ? 'input[type="email"]' : 'input[type="tel"], input[placeholder*="phone" i]',
    );
    if (input) {
      input.value = saved;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, []);

  return (
    <section
      ref={ref}
      id="booking"
      className="relative overflow-hidden bg-black px-6 py-20 md:py-28"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-emerald-500/[0.07] blur-[120px]" />
        <div className="absolute -bottom-24 right-1/4 h-80 w-80 rounded-full bg-cyan-500/[0.07] blur-[130px]" />
      </div>
      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 text-center"
        >
          <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Book In-Clinic
          </span>
          <h2 className="mt-5 font-serif-display text-4xl tracking-tight text-white no-underline md:text-5xl">
            Schedule your{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent no-underline">
              appointment
            </span>
          </h2>
          <p className="mt-3 text-sm text-white/50 italic">
            Pick a service, choose a date, and lock in your slot in seconds.
          </p>
          <div className="mt-4 flex justify-center">
            <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-white/80">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              First Time Free Assessment — new patients enjoy a complimentary initial checkup
            </span>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="landing-dark-panel [&_.text-muted-foreground]:text-white/50 [&_.text-foreground]:text-white [&_.border-border]:border-white/10 [&_.bg-card]:bg-white/[0.03] [&_.bg-background]:bg-transparent [&_.bg-muted]:bg-white/5 [&_.shadow-soft]:shadow-none [&_.shadow-card]:shadow-none"
        >
          <BookingPanel />
        </motion.div>
      </div>
    </section>
  );
}
