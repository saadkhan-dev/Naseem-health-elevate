import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "@tanstack/react-router";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ShieldCheck,
  Video,
  Calendar,
  FileText,
  Package,
} from "lucide-react";
import { usePublicVideoOffers } from "@/hooks/queries/useContent";
import { useServices } from "@/hooks/queries/useBookings";
import { isVideoConsultationService } from "@/lib/bookings";
import { VideoOfferCards } from "@/components/site/VideoOfferCards";
import { usePauseOffscreenVideo } from "@/hooks/usePauseOffscreenVideo";

const FEATURED_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260402_054547_9875cfc5-155a-4229-8ec8-b7ba7125cbf8.mp4";

const STEPS = [
  {
    step: "01",
    title: "Schedule  Video Consult. Slot",
    desc: "Pick your preferred date & time online",
    icon: Calendar,
  },
  {
    step: "02",
    title: "HD Video Call",
    desc: "Direct confidential consult with Dr. Naseem",
    icon: Video,
  },
  {
    step: "03",
    title: "Digital Prescription",
    desc: "Instant dosage & lifestyle plan via portal",
    icon: FileText,
  },
  {
    step: "04",
    title: "Medicine Delivery",
    desc: "Homeopathic remedies delivered home",
    icon: Package,
  },
];

export function FeaturedVideoSection() {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const { data: offers } = usePublicVideoOffers();
  const { data: services } = useServices();
  const videoServicePrice = services?.find(isVideoConsultationService)?.price;
  // Only play/pause the preview video when it is near the viewport, and never
  // override the user's own play/pause buttons.
  usePauseOffscreenVideo(videoRef, { shouldPlay: () => isPlaying });

  function togglePlay() {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      void videoRef.current.play();
      setIsPlaying(true);
    }
  }

  function toggleMute() {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }

  return (
    <section
      ref={ref}
      id="video-consultation"
      className="relative overflow-hidden bg-black px-6 pt-10 pb-20 md:pt-16 md:pb-32"
    >
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mb-10 text-center"
        >
          <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
            <strong>Video Consultation</strong>
          </span>
          <h2 className="mt-3 font-serif-display text-4xl tracking-tight text-white md:text-5xl lg:text-6xl">
            Expert Care, <em className="italic text-white/60">Anywhere in Pakistan</em>
          </h2>
          <p className="mt-4 mx-auto max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
            Can't visit North Karachi in person? Connect directly with Dr. Naseem through secure HD
            video consultations from the comfort and privacy of your home.
          </p>
        </motion.div>

        {/* Video Screen Container */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9 }}
          className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
        >
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted={isMuted}
            loop
            playsInline
            preload="metadata"
            src={FEATURED_VIDEO}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />

          {/* Top Video HUD Controls */}
          <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
            <div className="liquid-glass flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-[10px] font-medium text-white sm:text-[11px]">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="truncate">HD Video Consult Preview</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute video" : "Mute video"}
                className="liquid-glass rounded-full p-2.5 text-white/80 transition-all hover:bg-white/20 hover:text-white"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="liquid-glass rounded-full p-2.5 text-white/80 transition-all hover:bg-white/20 hover:text-white"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Bottom Card Overlay */}
          <div className="absolute right-0 bottom-0 left-0 flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between md:p-10">
            <div className="liquid-glass-glow max-w-lg rounded-2xl p-5 md:p-6">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold tracking-widest text-emerald-300 uppercase">
                  Private & Secure
                </span>
              </div>
              <p className="text-sm leading-relaxed text-white/90 md:text-base">
                Complete health assessment, consultation, and a personalized treatment plan
                delivered directly to your phone.
              </p>
            </div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/booking"
                search={{ mode: "video" }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-300 sm:w-auto sm:px-8 sm:py-4"
              >
                <Video className="h-4 w-4" />
                Book Video Consultation
              </Link>
            </motion.div>
          </div>
        </motion.div>

        {/* Current & upcoming Video Consultation offers (pricing/deals) */}
        <VideoOfferCards
          offers={offers ?? []}
          basePrice={videoServicePrice}
          className="mx-auto mt-6 max-w-xl text-left"
        />

        {/* 4-Step Virtual Care Roadmap */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 + idx * 0.1 }}
                className="liquid-glass group rounded-2xl p-5 transition-all hover:bg-white/[0.04]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-serif-display text-2xl font-light text-emerald-400/80">
                    {step.step}
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60 group-hover:text-emerald-300">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-1 text-xs text-white/50">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
