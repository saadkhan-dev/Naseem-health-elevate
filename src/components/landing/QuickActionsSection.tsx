import { useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  CreditCard,
  UserRound,
  Package,
  ArrowRight,
  Sparkles,
  Video,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

const ACTIONS = [
  {
    Icon: Video,
    title: "Book Video Consultation",
    description: "Secure one-on-one HD video consultation with Dr. Naseem from home.",
    href: "#video-consultation",
    isHash: true,
    badge: "Remote Care",
    glow: "from-cyan-500/20 to-cyan-400/5",
  },
  {
    Icon: CalendarCheck,
    title: "Book In-Clinic",
    description: "Schedule your in-clinic visit or HD video tele-consultation online.",
    href: "#booking",
    isHash: true,
    badge: "Fast Booking",
    glow: "from-emerald-500/20 to-emerald-400/5",
  },
  {
    Icon: Package,
    title: "Track Appointment",
    description: "Real-time verification for your appointment status and Medicine Delivery.",
    href: "/appointment-status",
    isHash: false,
    badge: "Live Status",
    glow: "from-cyan-500/20 to-cyan-400/5",
  },
  {
    Icon: CreditCard,
    title: "Remedies & Health Store",
    description: "Order doctor-prescribed natural homeopathic remedies and supplements.",
    href: "/shop",
    isHash: false,
    badge: "Verified Store",
    glow: "from-violet-500/20 to-violet-400/5",
  },
  {
    Icon: UserRound,
    title: "Digital Patient Portal",
    description: "Access your clinical history, digital prescriptions, and direct receipts.",
    href: "/patient",
    isHash: false,
    badge: "Patient Hub",
    glow: "from-amber-500/20 to-amber-400/5",
  },
];

export function QuickActionsSection() {
  const { user } = useAuth();

  return (
    <section className="overflow-hidden bg-black px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 text-center md:mb-16"
        >
          <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
            <strong>Complete Healthcare Hub</strong>
          </span>
          <h2 className="mt-3 font-serif-display text-4xl tracking-tight text-white md:text-5xl">
            Everything you need, <em className="italic text-white/60">one click away</em>
          </h2>
          <p className="mt-3 text-sm text-white/50">
            Simple digital portal for easy patient access
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {ACTIONS.map((action, index) => (
            <ActionCard key={action.title} action={action} index={index} user={user} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionCard({
  action,
  index,
  user,
}: {
  action: (typeof ACTIONS)[number];
  index: number;
  user: unknown;
}) {
  const [hovered, setHovered] = useState(false);

  const content = (
    <div
      className="liquid-glass group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-6 transition-all duration-500 hover:bg-white/[0.06] hover:-translate-y-2 shine-sweep"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Slowly rotating conic glow ring (always on, subtle) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[2px] rounded-2xl opacity-60 transition-opacity duration-700 animate-slow-spin"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, rgba(52,211,153,0.22) 90deg, rgba(34,211,238,0.18) 160deg, transparent 240deg, transparent 360deg)`,
        }}
      />
      {/* Animated glow ring */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br ${action.glow} opacity-0 blur-md transition-opacity duration-700 ${hovered ? "opacity-100" : ""}`}
      />
      {/* Glowing border on hover */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 transition-all duration-500 ${hovered ? "ring-emerald-400/40 shadow-[0_0_35px_rgba(16,185,129,0.25)]" : "ring-white/10"}`}
      />

      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <motion.div
            animate={hovered ? { scale: 1.15, rotate: -6 } : { scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-white transition-colors duration-500 group-hover:bg-emerald-400/20 group-hover:text-emerald-300"
          >
            <action.Icon className="h-5 w-5" />
          </motion.div>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 transition-colors duration-300 group-hover:bg-emerald-400/10 group-hover:text-emerald-300">
            {action.badge}
          </span>
        </div>
        <h3 className="mb-2 text-lg font-bold text-white transition-colors group-hover:text-emerald-300">
          {action.title}
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-white/50">{action.description}</p>
      </div>

      <span className="relative inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 transition-colors group-hover:text-emerald-400">
        {action.title.includes("Portal") && user ? "Go to my portal" : "Access service"}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1.5" />
      </span>

      {/* Sparkle particles on hover */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute right-4 top-4"
        >
          <Sparkles className="h-4 w-4 text-emerald-400/40 animate-pulse" />
        </motion.div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {action.isHash ? (
        <a href={action.href} className="block h-full">
          {content}
        </a>
      ) : (
        <Link to={action.href} className="block h-full">
          {content}
        </Link>
      )}
    </motion.div>
  );
}
