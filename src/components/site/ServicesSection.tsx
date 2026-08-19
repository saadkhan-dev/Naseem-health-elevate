import {
  Activity,
  HeartPulse,
  Stethoscope,
  Clock,
  Video,
  CalendarCheck,
  Leaf,
  UserRound,
  House,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { useServices } from "@/hooks/queries/useBookings";
import { isHomeVisitService, isVideoConsultationService, getServiceFeeLabel } from "@/lib/bookings";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Reveal } from "@/components/site/Reveal";
import { SectionDeco } from "@/components/site/SectionDeco";

function getServiceIcon(service: { name: string }): LucideIcon {
  const name = service.name.toLowerCase();
  if (isVideoConsultationService(service)) return Video;
  if (name.includes("physio")) return Activity;
  if (name.includes("homeopath")) return Leaf;
  if (isHomeVisitService(service)) return House;
  if (name.includes("patient")) return UserRound;
  if (name.includes("consult")) return Stethoscope;
  if (name.includes("appointment") || name.includes("booking")) return CalendarCheck;
  if (name.includes("pain") || name.includes("rehab")) return Activity;
  if (name.includes("treatment") || name.includes("therap")) return HeartPulse;
  return HeartPulse;
}

export function ServicesSection() {
  const { data: services, isLoading } = useServices();

  return (
    <section
      id="services"
      className="relative overflow-hidden bg-section-sky px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <SectionDeco />
      <div className="relative mx-auto max-w-7xl">
        <Reveal>
          <SectionHeading
            eyebrow="What We Offer"
            title="Our Services"
            accent="Healthcare Services Designed Around You"
            subtitle="Professional homeopathic and physiotherapy care with a personalized approach for better health and well-being."
          />
        </Reveal>

        {/* Services Grid */}
        <div className="mt-12 flex flex-wrap justify-center gap-5">
          {isLoading ? (
            <p className="w-full text-center text-sm text-muted-foreground">Loading services...</p>
          ) : services && services.length > 0 ? (
            services.map((service, index) => {
              const Icon = getServiceIcon(service);
              const feeLabel = getServiceFeeLabel(service);
              const homeVisit = isHomeVisitService(service);

              return (
                <Reveal
                  key={service.id}
                  delay={(index % 3) * 90}
                  className="w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.833rem)]"
                >
                  <div className="group relative h-full overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99]">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    />
                    <div className="relative flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 text-primary ring-1 ring-primary/10 transition-all duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:from-primary group-hover:to-primary group-hover:text-primary-foreground">
                      <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="mt-5 font-display text-[22px] font-semibold text-foreground transition-colors duration-300 group-hover:text-primary sm:text-xl">
                      {service.name}
                    </h3>

                    <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                      {service.description}
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-border pt-4 text-[13px] text-muted-foreground sm:text-xs">
                      {homeVisit ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                          <Clock className="h-3.5 w-3.5" />
                          Flexible duration
                        </span>
                      ) : (
                        (service.duration_minutes ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                            <Clock className="h-3.5 w-3.5" />
                            {service.duration_minutes} min
                          </span>
                        )
                      )}
                      {feeLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary">
                          {feeLabel}
                        </span>
                      )}
                      <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                    </div>
                  </div>
                </Reveal>
              );
            })
          ) : (
            <p className="w-full text-center text-sm text-muted-foreground">
              No services available yet.
            </p>
          )}
        </div>

        {/* Bottom Highlights */}
        <Reveal delay={120}>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-soft active:scale-[0.99]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground sm:text-sm">
                  Convenient Care
                </p>
                <p className="text-[13px] text-muted-foreground sm:text-xs">
                  Flexible consultation options
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-soft active:scale-[0.99]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
                <Stethoscope className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground sm:text-sm">
                  Experienced Care
                </p>
                <p className="text-[13px] text-muted-foreground sm:text-xs">
                  Professional healthcare guidance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-soft active:scale-[0.99]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-foreground sm:text-sm">
                  Patient First
                </p>
                <p className="text-[13px] text-muted-foreground sm:text-xs">
                  Care focused on your needs
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
