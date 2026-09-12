import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Award, Users, Activity, Sparkles, Clock, CheckCircle2 } from "lucide-react";

interface StatItem {
  id: string;
  label: string;
  target: number;
  suffix: string;
  prefix?: string;
  decimal?: boolean;
  desc: string;
  icon: typeof Award;
}

const STATS: StatItem[] = [
  {
    id: "years",
    label: "Clinical Experience",
    target: 20,
    suffix: "+",
    desc: "Years of specialized practice",
    icon: Award,
  },
  {
    id: "patients",
    label: "Patients Restored",
    target: 15000,
    suffix: "+",
    desc: "Karachi, Pakistan",
    icon: Users,
  },
  {
    id: "recovery",
    label: "Patient Satisfaction",
    target: 98.8,
    suffix: "%",
    decimal: true,
    desc: "Verified successful outcomes",
    icon: Activity,
  },
  {
    id: "natural",
    label: "Natural Healing",
    target: 100,
    suffix: "%",
    desc: "Personalized & Non-Invasive Care",
    icon: Sparkles,
  },
];

function AnimatedCounter({ stat, inView }: { stat: StatItem; inView: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = 0;
    const duration = 1600;
    const frameRate = 1000 / 60;
    const totalFrames = Math.round(duration / frameRate);
    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const easeOutQuad = 1 - (1 - progress) * (1 - progress);
      const current = start + (stat.target - start) * easeOutQuad;

      if (frame >= totalFrames) {
        setCount(stat.target);
        clearInterval(timer);
      } else {
        setCount(current);
      }
    }, frameRate);

    return () => clearInterval(timer);
  }, [inView, stat.target]);

  const formatted = stat.decimal
    ? count.toFixed(1)
    : stat.target >= 1000
      ? Math.round(count).toLocaleString()
      : Math.round(count).toString();

  return (
    <span className="font-serif-display text-3xl font-normal tracking-tight text-white sm:text-5xl">
      {stat.prefix}
      {formatted}
      <span className="text-emerald-400">{stat.suffix}</span>
    </span>
  );
}

export function ClinicStatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section ref={ref} className="relative z-10 mx-auto -mt-8 max-w-6xl px-6 sm:-mt-12">
      <div className="liquid-glass-glow rounded-3xl p-6 sm:p-8">
        {/* Live Clinic Telemetry Pill */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium tracking-wide text-white/90 uppercase">
              Online Tele-Consultation Active
            </span>
          </div>

          <div className="flex items-center gap-4 text-white/60">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-400/80" />
              Clinic Hours: 7:00 PM – 11:00 PM PKT
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400/80" />
              Qualified DHMS, RHMP & CPT Practitioner
            </span>
          </div>
        </div>

        {/* 4-Column Stat HUD */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8">
          {STATS.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.id}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                className="group flex flex-col justify-between"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wider text-white/40 uppercase">
                    {stat.label}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/60 transition-transform group-hover:scale-110 group-hover:text-emerald-400">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>

                <div className="my-1">
                  <AnimatedCounter stat={stat} inView={inView} />
                </div>

                <p className="mt-1 text-xs text-white/50">{stat.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
