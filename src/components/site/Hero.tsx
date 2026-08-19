import * as React from "react";
import {
  Calendar,
  Video,
  ShieldCheck,
  UserRound,
  HeartPulse,
  Award,
  Stethoscope,
} from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import homeSectionImg from "@/assets/home-section.webp";
import physioImage from "@/assets/physio_image.jpg.jpeg";
import { SectionLink } from "@/components/site/SectionLink";

const heroSlides = [
  {
    src: homeSectionImg,
    alt: "Dr. Naseem Ahmed Khan — Homeopathic & Physiotherapist in Karachi",
  },
  {
    src: physioImage,
    alt: "Physiotherapy session at Rahat Homeopathic & Physiotherapy Clinic, Karachi",
  },
];

export function Hero() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) return;

    const id = window.setInterval(() => emblaApi.scrollNext(), 4500);
    return () => window.clearInterval(id);
  }, [emblaApi]);

  return (
    <section
      id="home"
      className="relative min-h-[calc(100svh_-_4rem)] overflow-hidden bg-gradient-hero md:min-h-[calc(100svh_-_4.5rem)]"
    >
      <div className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_60%_at_80%_20%,oklch(0.88_0.08_195/0.5),transparent_60%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-5 pb-8 md:px-8 md:pt-8 md:pb-10 lg:grid-cols-[1.15fr_1fr] lg:pt-8 lg:pb-12">
        {/* Left */}
        <div className="text-center lg:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now accepting new patients in Karachi
          </div>
          <h1 className="mx-auto max-w-2xl font-display text-4xl font-semibold leading-[1.05] text-[#0015ff] md:text-5xl lg:mx-0 lg:text-6xl">
            Rahat Homeopathic & <span className="text-primary">Physiotherapy Clinic</span>{" "}
          </h1>

          <h2 className="mt-2 text-3xl font-bold text-[#ff0000] italic">
            Healing Naturally, Living Better.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg lg:mx-0">
            Natural healing. Pain relief. Better health. Personalized, patient-first care from Dr.
            Naseem Ahmed Khan — for you and your family.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start xl:flex-nowrap">
            <SectionLink
              hash="booking"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-glass active:scale-[0.97] sm:text-sm"
            >
              <Calendar className="h-4 w-4" /> Book Appointment
            </SectionLink>
            <SectionLink
              hash="video-consultation"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-[15px] font-semibold text-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted hover:shadow-soft active:scale-[0.97] sm:text-sm"
            >
              <Video className="h-4 w-4 text-primary" /> Video Consultation
            </SectionLink>
            <a
              href="#diseases"
              className="inline-flex items-center gap-2 rounded-full border-2 border-primary bg-card px-4 py-3.5 text-[15px] font-semibold text-primary shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:shadow-glass active:scale-[0.97] sm:text-sm"
            >
              <Stethoscope className="h-4 w-4" /> Diseases We Treat
            </a>
          </div>

          <div className="mt-8 grid max-w-lg grid-cols-1 gap-4 min-[420px]:grid-cols-3 lg:mx-0 mx-auto">
            {[
              { Icon: UserRound, t: "Experienced Doctor", s: "20 Years of expertise" },
              { Icon: ShieldCheck, t: "Natural & Safe", s: "Gentle & Effective" },
              { Icon: HeartPulse, t: "Personalized Care", s: "Patient First" },
            ].map(({ Icon, t, s }) => (
              <div
                key={t}
                className="group flex items-start justify-center gap-2.5 lg:justify-start"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 text-left leading-tight">
                  <div className="text-[13px] font-semibold text-foreground transition-colors duration-300 group-hover:text-primary sm:text-xs">
                    {t}
                  </div>
                  <div className="text-xs text-muted-foreground">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="relative">
          <div className="group relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] bg-primary-soft shadow-soft">
            <div ref={emblaRef} className="h-full overflow-hidden">
              <div className="flex h-full">
                {heroSlides.map((slide, i) => (
                  <div key={slide.src} className="relative h-full min-w-0 flex-[0_0_100%]">
                    <img
                      src={slide.src}
                      alt={slide.alt}
                      width={1122}
                      height={1402}
                      loading={slide.src === physioImage ? "lazy" : "eager"}
                      className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ${
                        current === i ? "group-hover:scale-105" : ""
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Slider pagination dots */}
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
              {heroSlides.map((slide, i) => (
                <button
                  key={slide.src}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => emblaApi?.scrollTo(i)}
                  className={`h-2 rounded-full shadow-sm transition-all duration-300 ${
                    current === i ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Floating glass card */}
          <FloatCard
            className="absolute -right-2 top-8 md:-right-6"
            Icon={Award}
            title="First Time Free Assessment"
            text="New patients enjoy a complimentary initial checkup."
          />
        </div>
      </div>
    </section>
  );
}

function FloatCard({
  Icon,
  title,
  text,
  className = "",
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`glass group shadow-glass w-56 rounded-2xl border border-white/60 p-3.5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-soft active:scale-[0.98] ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-110">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{text}</div>
        </div>
      </div>
    </div>
  );
}
