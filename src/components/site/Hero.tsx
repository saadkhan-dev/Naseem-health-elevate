import {
  Calendar,
  Video,
  ShieldCheck,
  UserRound,
  HeartPulse,
  Award,
  Stethoscope,
} from "lucide-react";
import homeSectionImg from "@/assets/home-section.jpg";
import { SectionLink } from "@/components/site/SectionLink";

export function Hero() {
  return (
    <section
      id="home"
      className="relative min-h-[calc(100svh_-_4rem)] overflow-hidden bg-gradient-hero md:min-h-[calc(100svh_-_4.5rem)]"
    >
      <div className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_60%_at_80%_20%,oklch(0.88_0.08_195/0.5),transparent_60%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-5 pb-8 md:px-8 md:pt-8 md:pb-10 lg:grid-cols-[1.15fr_1fr] lg:pt-8 lg:pb-12">
        {/* Left */}
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now accepting new patients in Karachi
          </div>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] text-[#0015ff] md:text-5xl lg:text-6xl">
            Rahat Homeopathic & <span className="text-primary">Physiotherapy Clinic</span>{" "}
          </h1>

          <h3 className="mt-2 text-3xl font-bold text-[#ff0000] italic">
            Healing Naturally, Living Better.
          </h3>
          <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
            Natural healing. Pain relief. Better health. Personalized, patient-first care from Dr.
            Naseem Ahmed Khan — for you and your family.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5 xl:flex-nowrap">
            <SectionLink
              hash="booking"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.05] hover:shadow-glass active:scale-[0.97]"
            >
              <Calendar className="h-4 w-4" /> Book Appointment
            </SectionLink>
            <SectionLink
              hash="video-consultation"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted hover:shadow-soft active:scale-[0.97]"
            >
              <Video className="h-4 w-4 text-primary" /> Video Consultation
            </SectionLink>
            <a
              href="#diseases"
              className="inline-flex items-center gap-2 rounded-full border-2 border-primary bg-card px-4 py-3.5 text-sm font-semibold text-primary shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:shadow-glass active:scale-[0.97]"
            >
              <Stethoscope className="h-4 w-4" /> Diseases We Treat
            </a>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 max-w-lg">
            {[
              { Icon: UserRound, t: "Experienced Doctor", s: "20 Years of expertise" },
              { Icon: ShieldCheck, t: "Natural & Safe", s: "Gentle & Effective" },
              { Icon: HeartPulse, t: "Personalized Care", s: "Patient First" },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="group flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-foreground transition-colors duration-300 group-hover:text-primary">
                    {t}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="relative">
          <div className="group relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] bg-primary-soft shadow-soft">
            <img
              src={homeSectionImg}
              alt="Dr. Naseem Ahmed Khan — Homeopathic & Physiotherapist in Karachi"
              width={1122}
              height={1402}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
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
