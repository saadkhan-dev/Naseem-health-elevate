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
  type LucideIcon,
} from "lucide-react";
import { useServices } from "@/hooks/queries/useBookings";
import { isHomeVisitService, isVideoConsultationService, getServiceFeeLabel } from "@/lib/bookings";

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
    <section id="services" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold text-red-600 sm:text-5xl">Our Services</h2>

          <h3 className="mt-3 font-display text-[22px] font-semibold text-primary sm:text-2xl">
            Healthcare Services Designed Around You
          </h3>

          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Professional homeopathic and physiotherapy care with a personalized approach for better
            health and well-being.
          </p>
        </div>

        {/* Services Grid */}
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {isLoading ? (
            <p className="w-full text-center text-sm text-muted-foreground">Loading services...</p>
          ) : services && services.length > 0 ? (
            services.map((service) => {
              const Icon = getServiceIcon(service);
              const feeLabel = getServiceFeeLabel(service);
              const homeVisit = isHomeVisitService(service);

              return (
                <div
                  key={service.id}
                  className="group w-full rounded-3xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99] sm:w-[calc(50%-0.5rem)] sm:p-6 lg:w-[calc(33.333%-0.667rem)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mt-4 font-display text-[22px] font-semibold text-foreground transition-colors duration-300 group-hover:text-primary sm:text-xl">
                    {service.name}
                  </h3>

                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
                    {service.description}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground sm:text-xs">
                    {homeVisit ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Flexible duration
                      </span>
                    ) : (
                      (service.duration_minutes ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {service.duration_minutes} min
                        </span>
                      )
                    )}
                    {feeLabel && (
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        {feeLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="w-full text-center text-sm text-muted-foreground">
              No services available yet.
            </p>
          )}
        </div>

        {/* Bottom Highlights */}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99]">
            <Clock className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-[15px] font-semibold text-foreground sm:text-sm">
                Convenient Care
              </p>
              <p className="text-[13px] text-muted-foreground sm:text-xs">
                Flexible consultation options
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99]">
            <Stethoscope className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-[15px] font-semibold text-foreground sm:text-sm">
                Experienced Care
              </p>
              <p className="text-[13px] text-muted-foreground sm:text-xs">
                Professional healthcare guidance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft active:scale-[0.99]">
            <UserRound className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-[15px] font-semibold text-foreground sm:text-sm">Patient First</p>
              <p className="text-[13px] text-muted-foreground sm:text-xs">
                Care focused on your needs
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
