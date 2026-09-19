import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ChevronDown,
  Instagram,
  Facebook,
  MessageCircle,
  ShieldCheck,
  Video,
  HeartPulse,
  User,
  Youtube,
} from "lucide-react";
import { SectionLink } from "@/components/site/SectionLink";
import { whatsappUrl } from "@/lib/contact";
import { useVideoFadeLoop } from "@/hooks/useVideoFadeLoop";
import { usePauseOffscreenVideo } from "@/hooks/usePauseOffscreenVideo";
import {
  GoogleIcon,
  GOOGLE_PLACEHOLDER,
  YOUTUBE_PLACEHOLDER,
  type SocialIcon,
} from "@/lib/socials";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4";

export function LandingHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoFadeLoop(videoRef);
  // Pause the hero video while it is scrolled off-screen / tab is hidden.
  usePauseOffscreenVideo(videoRef);

  // Skip the scroll-linked parallax on touch devices & reduced-motion users:
  // on mobile it forces a repaint+composite on every scroll frame.
  const [parallax, setParallax] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fine && !reduced) setParallax(true);
  }, []);

  // Parallax: as the user scrolls, the video & content drift at different speeds.
  const { scrollYProgress } = useScroll();
  const videoY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const videoScale = useTransform(scrollYProgress, [0, 1], [1, 1.18]);
  const contentY = useTransform(scrollYProgress, [0, 0.6], ["0%", "24%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <section
      id="home"
      className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-black pb-12"
    >
      {/* Background Video with seamless vanilla JS requestAnimationFrame loop */}
      <motion.div
        style={parallax ? { y: videoY, scale: videoScale } : undefined}
        className="absolute inset-0"
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover object-bottom"
          style={{ opacity: 0 }}
          muted
          autoPlay
          playsInline
          preload="auto"
          src={HERO_VIDEO}
        />
      </motion.div>

      {/* Futuristic layered gradient overlays */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.06)_0%,_transparent_70%)]" />

      {/* Main Hero Content */}
      <motion.div
        style={parallax ? { y: contentY, opacity: contentOpacity } : undefined}
        className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pt-6 pb-12 text-center sm:justify-center sm:py-16"
      >
        {/* Editorial Heading with Instrument Serif */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif-display text-4xl tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Rahat Homeopathic & Physiotherapy Clinic
        </motion.h1>

        {/* Hero Subtitle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-6 max-w-2xl px-4"
        >
          <h2 className="font-serif-display text-2xl font-semibold tracking-tight text-[#00D492] sm:text-3xl">
            Healing Naturally, Living Better
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
            Natural healing. Pain relief. Better health. Personalized, patient-first care from
            <strong className="font-semibold text-white/90"> Dr. Naseem Ahmed Khan</strong> — for
            you and your family.
          </p>
        </motion.div>

        {/* Book Now Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.36 }}
          className="mt-8 font-serif-display text-3xl tracking-tight text-white sm:text-4xl"
        >
          Book <span className="italic text-emerald-400">Now</span>
        </motion.h2>

        {/* Action CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.44 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-3"
        >
          <SectionLink
            hash="#booking"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:shadow-glass"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            In-Clinic Appointment
          </SectionLink>
          <SectionLink
            hash="#video-consultation"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:shadow-glass"
          >
            <Video className="h-4 w-4 text-cyan-400" />
            Video Tele-Consult
          </SectionLink>
          <SectionLink
            hash="#diseases"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:shadow-glass"
          >
            <HeartPulse className="h-4 w-4 text-emerald-400" />
            Conditions We Treat
          </SectionLink>
          <Link
            to="/patient"
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:shadow-glass"
          >
            <User className="h-4 w-4 text-emerald-400" />
            Patient Portal
          </Link>
        </motion.div>

        {/* Social Icons & WhatsApp Quick Connect */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.52 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2 px-3 sm:mt-10 sm:gap-3 sm:px-6 md:mt-12"
        >
          {(
            [
              {
                Icon: Instagram,
                href: "https://www.instagram.com/rahatphysio9?igsh=bTE0N2k0d3o4cXI2",
                label: "Instagram",
              },
              {
                Icon: Facebook,
                href: "https://www.facebook.com/share/1EoXFSNZkm/",
                label: "Facebook",
              },
              {
                Icon: MessageCircle,
                href: whatsappUrl("Hi Dr. Naseem, I would like to book a consultation."),
                label: "WhatsApp Fast Connect",
              },
              { Icon: GoogleIcon, href: GOOGLE_PLACEHOLDER, label: "Google" },
              { Icon: Youtube, href: YOUTUBE_PLACEHOLDER, label: "YouTube" },
            ] as { Icon: SocialIcon; href: string; label: string }[]
          ).map(({ Icon, href, label }) => (
            <a
              key={label}
              href={href}
              {...(href.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              aria-label={label}
              className="liquid-glass flex items-center gap-2 rounded-full px-3 py-2 text-xs text-white/80 transition-all hover:scale-105 hover:bg-white/10 hover:text-white sm:px-4 sm:py-2.5"
            >
              <Icon className="h-3.5 w-3.5 text-emerald-400 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{label}</span>
            </a>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll-down hint */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.8 }}
        className="relative z-10 flex items-center justify-center gap-2 pb-1 text-[11px] text-white/45"
      >
        <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <ChevronDown className="h-4 w-4 text-emerald-400/70" />
        </motion.span>
        <span>Scroll to explore</span>
        <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <ChevronDown className="h-4 w-4 text-emerald-400/70" />
        </motion.span>
      </motion.div>
    </section>
  );
}
