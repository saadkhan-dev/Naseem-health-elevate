import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Shield, Sparkles, HeartPulse, GraduationCap, CheckCircle } from "lucide-react";
import doctorImg from "@/assets/doctor-about.jpg";

const PILLARS = [
  {
    id: "root-cause",
    title: "Personalized Homeopathic Assessment",
    icon: Sparkles,
    desc: "Rather than focusing only on symptoms, we look at your overall health to provide personalized care.",
  },
  {
    id: "rehab",
    title: "Targeted Physiotherapy Care",
    icon: HeartPulse,
    desc: "Manual therapy, corrective exercises, and posture training to help reduce pain and improve movement.",
  },
  {
    id: "synergy",
    title: "Integrated Homeopathy & Physiotherapy",
    icon: Shield,
    desc: "Combining natural care with physiotherapy to support better health and recovery.",
  },
];

export function AboutSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [activePillar, setActivePillar] = useState(0);

  return (
    <section
      ref={ref}
      id="about"
      className="relative overflow-hidden bg-black px-6 pt-16 pb-20 md:pt-44 md:pb-28"
    >
      {/* Background Radial Light */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.04)_0%,_transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl">
        {/* Section Tag */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2"
        >
          <span className="h-px w-8 bg-emerald-400/60" />
          <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
            <strong>Our Approach to Patient Care</strong>
          </span>
        </motion.div>

        {/* Editorial Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 36, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 font-display text-4xl leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl"
        >
          <span className="font-serif-display italic text-white/60">
            Natural Healing for Better, Healthier Living.
          </span>
        </motion.h2>

        {/* Two-Column Grid: Doctor Profile & Interactive Pillars */}
        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Doctor Profile Card */}
          <motion.div
            initial={{ opacity: 0, x: -34, scale: 0.97 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-5"
          >
            <div className="liquid-glass-glow group relative overflow-hidden rounded-3xl p-6 sm:p-8">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-white/5 sm:aspect-[4/5]">
                <img
                  src={doctorImg}
                  alt="Dr. Naseem Ahmed Khan"
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute right-4 bottom-4 left-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md">
                    <GraduationCap className="h-3.5 w-3.5" /> D.H.M.S, R.H.M.P, C.P.T
                  </span>
                  <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">
                    Dr. Naseem Ahmed Khan
                  </h3>
                  <p className="text-xs text-white/70">Homeopathic & Physiotherapy Practitioner</p>
                </div>
              </div>

              <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-white/60">
                <div className="flex items-center justify-between">
                  <span><strong>Specialization:</strong></span>
                  <span className="font-medium text-white/90">Homeopathy & Physiotherapy</span>
                </div>
                <div className="flex items-center justify-between">
                  <span><strong>Practice Location:</strong></span>
                  <span className="font-medium text-white/90">North Karachi, Pakistan</span>
                </div>
                <div className="flex items-center justify-between">
                  <span><strong>Experience:</strong></span>
                  <span className="font-medium text-emerald-400">20+ Years Clinical Practice</span>
                </div>
              </div>

              {/* Qualifications & Experience — as published on the clinic's about content */}
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/40 sm:text-xs">
                  <GraduationCap className="h-3.5 w-3.5 text-emerald-400" />
                  Qualifications & Experience
                </p>
                <div className="mt-2.5 space-y-2">
                  {[
                    {
                      degree: "Diploma in Homeopathic Medicine & Surgery (D.H.M.S)",
                      institute: "Pakistan Central Homeopathic Medical College & Hospital, Karachi",
                    },
                    {
                      degree: "Registered Homeopathic Medical Practitioner (R.H.M.P)",
                      institute: "National Council for Homeopathy, Pakistan, Islamabad",
                    },
                    {
                      degree: "Certificate in Physiotherapy (C.P.T)",
                      institute: "Sindh Medical Faculty",
                    },
                  ].map((cred) => (
                    <div
                      key={cred.degree}
                      className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/5"
                    >
                      <p className="text-xs font-semibold leading-snug text-white">
                        {cred.degree}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/50 sm:text-xs">
                        {cred.institute}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Narrative & Interactive Core Pillars */}
          <motion.div
            initial={{ opacity: 0, x: 34, scale: 0.97 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col justify-between lg:col-span-7"
          >
            <p className="text-base leading-relaxed text-white/75 sm:text-lg">
              Dr. Naseem Ahmed is a highly educated and experienced Homeopath and Physiotherapist
              dedicated to providing professional, patient-focused care. He works with both acute
              and chronic health conditions, focusing on understanding each patient's individual
              needs.
            </p>
            <p className="mt-4 text-base leading-relaxed text-white/60 sm:text-sm">
              He combines homeopathic care with modern physiotherapy techniques to support natural
              healing, improve physical well-being, and help patients achieve better health and
              mobility. Every treatment plan is built on careful assessment, personalized care, and
              patient comfort — safe, effective care focused on your needs.
            </p>

            {/* Interactive Pillar Accordion Cards */}
            <div className="mt-8 space-y-4">
              {PILLARS.map((pillar, idx) => {
                const Icon = pillar.icon;
                const isActive = activePillar === idx;
                return (
                  <div
                    key={pillar.id}
                    onClick={() => setActivePillar(idx)}
                    className={`liquid-glass cursor-pointer rounded-2xl p-5 transition-all duration-300 ${
                      isActive
                        ? "bg-white/[0.06] ring-1 ring-emerald-400/40 shadow-glass"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                            isActive
                              ? "bg-emerald-400/20 text-emerald-400"
                              : "bg-white/5 text-white/60"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <h4 className="text-base font-semibold text-white sm:text-lg">
                          {pillar.title}
                        </h4>
                      </div>
                      <CheckCircle
                        className={`h-4 w-4 transition-transform ${
                          isActive ? "text-emerald-400 scale-110" : "text-white/20"
                        }`}
                      />
                    </div>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.3 }}
                        className="mt-3 text-sm leading-relaxed text-white/60"
                      >
                        {pillar.desc}
                      </motion.p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
