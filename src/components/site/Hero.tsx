import { Calendar, Video, Leaf, Activity, MapPin, ShieldCheck, UserRound, HeartPulse } from "lucide-react";
import doctorImg from "@/assets/doctor-portrait.jpg";
import { whatsappUrl } from "@/lib/contact";

export function Hero() {
  return (
    <section id="home" className="relative overflow-hidden bg-gradient-hero">
      <div className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_60%_at_80%_20%,oklch(0.88_0.08_195/0.5),transparent_60%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-2 lg:py-24">
        {/* Left */}
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now accepting new patients in Karachi
          </div>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] text-foreground md:text-5xl lg:text-6xl">
            Expert Homeopathic &{" "}
            <span className="text-primary">Physiotherapy Care</span>{" "}
            <span className="italic text-primary/80">for a Better You</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            Natural healing. Pain relief. Better health. Personalized,
            patient-first care from Dr. Naseem Alam — for you and your family.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#booking"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
            >
              <Calendar className="h-4 w-4" /> Book Appointment
            </a>
            <a
              href={whatsappUrl("Hi Dr. Naseem, I'd like to book a video consultation.")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground shadow-card transition-colors hover:bg-muted"
            >
              <Video className="h-4 w-4 text-primary" /> Video Consultation
            </a>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 max-w-lg">
            {[
              { Icon: UserRound, t: "Experienced Doctor", s: "Years of expertise" },
              { Icon: ShieldCheck, t: "Natural & Safe", s: "Gentle & Effective" },
              { Icon: HeartPulse, t: "Personalized Care", s: "Patient First" },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-xs font-semibold text-foreground">{t}</div>
                  <div className="text-[11px] text-muted-foreground">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="relative">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] bg-primary-soft shadow-soft">
            <img
              src={doctorImg}
              alt="Dr. Naseem Alam — Homeopathic & Physiotherapist in Karachi"
              width={1024}
              height={1280}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Floating glass cards */}
          <FloatCard
            className="absolute -left-2 top-8 md:-left-6"
            Icon={Leaf}
            title="Homeopathy"
            text="Natural healing for acute & chronic conditions."
          />
          <FloatCard
            className="absolute -right-2 top-1/2 -translate-y-1/2 md:-right-6"
            Icon={Activity}
            title="Physiotherapy"
            text="Pain relief & rehab with advanced techniques."
          />
          <FloatCard
            className="absolute -right-2 bottom-8 md:-right-6"
            Icon={MapPin}
            title="Karachi Based"
            text="Serving patients across Karachi with care."
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
    <div className={`glass shadow-glass w-56 rounded-2xl border border-white/60 p-3.5 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
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
