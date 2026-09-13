import { useRef, useMemo } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Sparkles,
  Activity,
  House,
  Stethoscope,
  HeartPulse,
} from "lucide-react";
import { SectionLink } from "@/components/site/SectionLink";
import { usePauseOffscreenVideo } from "@/hooks/usePauseOffscreenVideo";
import { useServices } from "@/hooks/queries/useBookings";
import { getServiceFeeLabel } from "@/lib/bookings";

const SERVICE_CARDS = [
  {
    video:
      "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4",
    tag: "Homeopathy Clinic",
    title: "Personalized & Chronic Care",
    description:
      "Personalized homeopathic care based on individual symptoms, constitution, and overall well-being.",
    highlights: [
      "Acute & Chronic Health Conditions",
      "Physical, Mental, & Emotional Wellness",
      "Natural Self-Healing Immunity",
      "Zero Harmful Side Effects",
      "Individual Health Concerns",
      "Personalized Homeopathic Care",
    ],
    link: "#booking",
    icon: Sparkles,
  },
  {
    video:
      "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4",
    tag: "Physiotherapy & Rehab",
    title: "Pain Management & Mobility",
    description:
      "Clinical physical therapy using targeted mobilization, posture correction, electro-therapy, and rehabilitative exercises.",
    highlights: [
      "Sciatica & Lumbar Disc Herniation",
      "Frozen Shoulder & Cervical Spondylosis",
      "Knee Arthritis & Joint Rehabilitation",
      "Musculoskeletal Alignment & Joint Range",
      "Post-Stroke & Neurological Recovery",
      "Sports Injury Recovery & Corrective Exercises",
    ],
    link: "#booking",
    icon: Activity,
  },
];

function TiltCard({
  card,
  index,
  inView,
}: {
  card: (typeof SERVICE_CARDS)[0];
  index: number;
  inView: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);
  usePauseOffscreenVideo(videoRef);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay: index * 0.15 }}
      style={{ perspective: 1200 }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="liquid-glass group block overflow-hidden rounded-3xl transition-all duration-300 hover:shadow-2xl"
      >
        <SectionLink hash={card.link} className="block">
          <div className="relative aspect-video overflow-hidden">
            <video
              ref={videoRef}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              muted
              loop
              playsInline
              preload="metadata"
              src={card.video}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute top-4 left-4">
              <span className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white">
                <card.icon className="h-3.5 w-3.5 text-emerald-400" />
                {card.tag}
              </span>
            </div>
          </div>

          <div className="p-5 md:p-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-emerald-300 md:text-2xl">
                {card.title}
              </h3>
              <span className="liquid-glass rounded-full p-2 text-white/60 transition-all group-hover:scale-110 group-hover:bg-emerald-400 group-hover:text-black">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </div>

            <p className="mb-5 text-sm leading-relaxed text-white/60">{card.description}</p>

            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold tracking-wider text-white/40 uppercase">
                <strong>Key Care Areas:</strong>
              </p>
              <ul className="grid grid-cols-1 gap-1.5 text-xs text-white/70 sm:grid-cols-2">
                {card.highlights.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionLink>
      </motion.div>
    </motion.div>
  );
}

export function LandingServicesSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  // Admin-managed services appear below the two showpiece video cards, so
  // Add/Edit/Remove in Admin → Services shows up on the website immediately.
  // Video consultation is excluded (it has its own booking flow + section),
  // and homeopathy/physiotherapy are already represented by the cards above.
  const { data: services } = useServices();
  const extraServices = useMemo(() => {
    const coveredCategories = ["homeopath", "physio", "rehab"];
    return (services ?? []).filter((s) => {
      const n = s.name.toLowerCase();
      if (n.includes("video consultation")) return false;
      return !coveredCategories.some((k) => n.includes(k));
    });
  }, [services]);

  function serviceIcon(s: { name: string }) {
    const n = s.name.toLowerCase();
    if (n.includes("home visit")) return <House className="h-5 w-5" />;
    if (n.includes("consult") || n.includes("appointment"))
      return <Stethoscope className="h-5 w-5" />;
    return <HeartPulse className="h-5 w-5" />;
  }

  return (
    <section
      ref={ref}
      id="services"
      className="relative overflow-hidden bg-black px-6 py-20 md:py-40"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.02)_0%,_transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 34, scale: 0.97 }}
          animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex flex-col justify-between gap-4 md:mb-16 md:flex-row md:items-end"
        >
          <div>
            <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
              <strong>Complete Patient Care</strong>
            </span>
            <h2 className="mt-2 font-serif-display text-4xl tracking-tight text-white md:text-5xl lg:text-6xl">
              Our Services
            </h2>
          </div>
          <span className="text-sm text-white/50">
            <strong>Personalized Care for Better Recovery</strong>
          </span>
        </motion.div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {SERVICE_CARDS.map((card, index) => (
            <TiltCard key={card.title} card={card} index={index} inView={inView} />
          ))}
        </div>

        {extraServices.length > 0 && (
          <div className="mt-12">
            <div className="mb-6 text-center text-xs font-semibold tracking-widest text-white/40 uppercase">
              <strong>More Services</strong>
            </div>
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
              {extraServices.map((s, index) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 28 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.3 + index * 0.08 }}
                  className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-white/10"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-400 ring-1 ring-emerald-400/30">
                    {serviceIcon(s)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    {s.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">
                        {s.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40">
                      {(s.duration_minutes ?? 0) > 0 && <span>{s.duration_minutes} min</span>}
                      {getServiceFeeLabel(s) && (
                        <span className="font-semibold text-emerald-400/80">
                          {getServiceFeeLabel(s)}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
