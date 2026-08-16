import * as React from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  Clock,
  ShieldCheck,
  CalendarCheck,
  UserCog,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useServices,
  useTimeSlots,
  useAvailability,
  useCreateAppointment,
} from "@/hooks/queries/useBookings";
import {
  formatTimeDisplay,
  isHomeVisitService,
  isVideoConsultationService,
  HOME_VISIT_FEE_LABEL,
} from "@/lib/bookings";
import { isDateBeforeTodayClinic } from "@/lib/clinic";
import type { NotificationResult } from "@/lib/notifications";
import { BookingConfirmation } from "./BookingConfirmation";

export function BookingPanel() {
  const [serviceId, setServiceId] = React.useState<string>();
  const [date, setDate] = React.useState<Date>();
  const [time, setTime] = React.useState<string>();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [appointmentId, setAppointmentId] = React.useState<string | null>(null);
  const [notifications, setNotifications] = React.useState<NotificationResult[]>([]);

  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: availability } = useAvailability();
  const { slots, isLoading: slotsLoading } = useTimeSlots(date, serviceId, services);
  const createAppointment = useCreateAppointment();
  const bookingServices = services
    ?.filter((s) => !isVideoConsultationService(s))
    .sort((a, b) => {
      const order = (service: typeof a) => {
        if (service.name.toLowerCase().includes("homeopathic")) return 1;
        if (service.name.toLowerCase().includes("physio")) return 2;
        if (isHomeVisitService(service)) return 3;
        return 99;
      };

      return order(a) - order(b);
    });
  const selectedService = services?.find((s) => s.id === serviceId);
  const isHomeVisit = selectedService ? isHomeVisitService(selectedService) : false;

  const openDays = React.useMemo(
    () => new Set(availability?.map((a) => a.day_of_week) ?? []),
    [availability],
  );

  async function handleSubmit() {
    setFormError("");
    if (!serviceId || !date) return;
    if (!isHomeVisit && !time) return;
    if (!name.trim()) {
      setFormError("Please enter your name.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setFormError("Please enter your phone number or email so we can send your Appointment ID.");
      return;
    }

    try {
      const result = await createAppointment.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        serviceId,
        date: format(date, "yyyy-MM-dd"),
        time: isHomeVisit ? undefined : time,
      });

      if (result.error) {
        setFormError(result.error);
      } else {
        setAppointmentId(result.appointmentNo);
        setNotifications(result.notifications);
        setConfirmed(true);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Booking failed. Please try again.");
    }
  }

  if (confirmed && selectedService && date) {
    return (
      <section id="booking" className="relative -mt-10 px-4 md:-mt-16 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-8">
            <BookingConfirmation
              serviceName={selectedService.name}
              date={date}
              time={isHomeVisit ? null : (time ?? null)}
              appointmentNo={appointmentId}
              notifications={notifications}
              onClose={() => {
                setConfirmed(false);
                setServiceId(undefined);
                setDate(undefined);
                setTime(undefined);
                setName("");
                setPhone("");
                setEmail("");
                setAppointmentId(null);
                setNotifications([]);
              }}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className="relative -mt-10 px-4 md:-mt-16 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-8">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold text-red-600 sm:text-4xl">
              Book Your Appointment
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
              No account needed — enter your name and either your phone number or email to book
              instantly.
            </p>
          </div>

          <div className="mt-6 grid items-end gap-5 lg:grid-cols-3">
            <Field label="Select Service">
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v);
                  setTime(undefined);
                }}
                disabled={servicesLoading}
              >
                <SelectTrigger className="h-11 w-full rounded-xl transition-all duration-300 hover:border-primary/40">
                  <SelectValue placeholder={servicesLoading ? "Loading..." : "Select Service"} />
                </SelectTrigger>
                <SelectContent>
                  {bookingServices?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {isHomeVisitService(s) ? ` — ${HOME_VISIT_FEE_LABEL}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Select Date">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-sm transition-all duration-300 hover:border-primary/40 active:scale-[0.99]",
                      !date && "text-muted-foreground",
                    )}
                  >
                    {date ? format(date, "PPP") : "Select Date"}
                    <CalendarIcon className="ml-2 h-4 w-4 text-primary" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto max-w-[calc(100vw-2rem)] p-0"
                  align="start"
                  sideOffset={4}
                >
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d);
                      setTime(undefined);
                    }}
                    disabled={(d) =>
                      isDateBeforeTodayClinic(d) || (!isHomeVisit && !openDays.has(d.getDay()))
                    }
                    initialFocus
                    className="p-3 pointer-events-auto [--cell-size:1.75rem] min-[360px]:[--cell-size:2rem]"
                  />
                </PopoverContent>
              </Popover>
            </Field>

            {isHomeVisit ? (
              <Field label="Visit Time">
                <div className="flex h-11 items-center rounded-xl border border-input bg-background px-3 text-sm text-muted-foreground">
                  Flexible — doctor confirms the time
                </div>
              </Field>
            ) : (
              <Field label="Select Time">
                <Select value={time} onValueChange={setTime} disabled={!date || slotsLoading}>
                  <SelectTrigger className="h-11 w-full rounded-xl transition-all duration-300 hover:border-primary/40">
                    <SelectValue
                      placeholder={
                        !date
                          ? "Pick a date first"
                          : slotsLoading
                            ? "Checking..."
                            : slots.length === 0
                              ? "No slots available"
                              : "Select Time"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {slots.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatTimeDisplay(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-[15px] font-semibold text-foreground sm:text-sm">Your Details</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="mb-1.5 text-xs font-medium text-foreground">Your Name</div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="h-11 rounded-xl transition-all duration-300 hover:border-primary/40"
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-foreground">
                  Phone Number <span className="text-muted-foreground">(optional)</span>
                </div>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 3XX XXXXXXX"
                  className="h-11 rounded-xl transition-all duration-300 hover:border-primary/40"
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-foreground">
                  Email Address <span className="text-muted-foreground">(optional)</span>
                </div>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl transition-all duration-300 hover:border-primary/40"
                />
              </div>
              <p className="text-[13px] text-muted-foreground sm:text-xs sm:col-span-2">
                Provide at least one — we'll send your Appointment ID there.
              </p>
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-[15px] font-medium text-destructive sm:text-sm">{formError}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!serviceId || !date || (!isHomeVisit && !time) || createAppointment.isPending}
            className="mt-6 h-12 w-full rounded-xl hover:brightness-[1.05]"
          >
            {createAppointment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Book Appointment <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <div className="mt-7 grid gap-4 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: CalendarCheck, t: "Easy Booking", s: "Simple 3 step booking" },
              { Icon: Clock, t: "Flexible Timing", s: "As per your convenience" },
              { Icon: ShieldCheck, t: "Secure & Reliable", s: "Your data is safe with us" },
              { Icon: UserCog, t: "Doctor-Managed", s: "Schedules updated anytime" },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="group flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-[15px] font-semibold text-foreground sm:text-sm">{t}</div>
                  <div className="text-[13px] text-muted-foreground sm:text-xs">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">{label}</div>
      {children}
    </div>
  );
}
