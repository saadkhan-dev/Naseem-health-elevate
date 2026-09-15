import * as React from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  CalendarIcon,
  Clock,
  ShieldCheck,
  CalendarCheck,
  UserCog,
  ArrowRight,
  Loader2,
  CalendarHeart,
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
  useCustomAvailability,
  useCreateAppointment,
} from "@/hooks/queries/useBookings";
import {
  formatTimeDisplay,
  isHomeVisitService,
  isVideoConsultationService,
  HOME_VISIT_FEE_LABEL,
} from "@/lib/bookings";
import { isDateBeforeTodayClinic, toClinicDate } from "@/lib/clinic";
import { useAuth } from "@/hooks/useAuth";
import type { NotificationResult } from "@/lib/notifications";
import { BookingConfirmation } from "./BookingConfirmation";

export function BookingPanel() {
  const { profile, user } = useAuth();
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
  const { data: customAvailability } = useCustomAvailability();
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

  // Dates with a one-time extra/custom slot stay bookable even on a closed day.
  const customDates = React.useMemo(
    () => new Set(customAvailability?.map((c) => c.specific_date) ?? []),
    [customAvailability],
  );

  // Prefill the contact fields from the signed-in patient's trusted profile.
  React.useEffect(() => {
    if (profile?.full_name && !name) setName(profile.full_name);
    if (profile?.phone && !phone) setPhone(profile.phone);
    if (user?.email && !email) setEmail(user.email);
  }, [profile, user, name, phone, email]);

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-7xl"
        >
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur-md md:p-8">
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
        </motion.div>
      </section>
    );
  }

  return (
    <section id="booking" className="relative -mt-10 px-4 md:-mt-16 md:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute left-10 top-1/2 hidden h-24 w-24 -translate-y-1/2 rounded-full border border-emerald-400/10 lg:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-8 right-10 hidden h-16 w-16 rounded-full bg-emerald-400/[0.08] lg:block"
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-7xl"
      >
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/60 p-5 shadow-2xl backdrop-blur-xl md:p-8">
          <div
            aria-hidden
            className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/20"
          />
          <div className="pt-6 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
              <CalendarHeart className="h-3 w-3" />
              Fast & Easy Booking
            </span>
            <h2 className="mt-3 font-serif-display text-3xl font-bold text-white sm:text-4xl">
              Book Your Appointment
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-sm italic">
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
                <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 focus:ring-emerald-400/50">
                  <SelectValue placeholder={servicesLoading ? "Loading..." : "Select Service"} />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl text-white">
                  {bookingServices?.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.id}
                      className="focus:bg-emerald-400/20 focus:text-white"
                    >
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
                      "flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 text-sm transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 active:scale-[0.99]",
                      date ? "text-white" : "text-white/40",
                    )}
                  >
                    {date ? format(date, "PPP") : "Select Date"}
                    <CalendarIcon className="ml-2 h-4 w-4 text-emerald-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto border-white/10 bg-black/90 p-0 backdrop-blur-xl"
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
                      isDateBeforeTodayClinic(d) ||
                      (!isHomeVisit &&
                        !openDays.has(d.getDay()) &&
                        !customDates.has(toClinicDate(d)))
                    }
                    initialFocus
                    className="p-3 pointer-events-auto text-white [--cell-size:1.75rem] min-[360px]:[--cell-size:2rem]"
                  />
                </PopoverContent>
              </Popover>
            </Field>

            {isHomeVisit ? (
              <Field label="Visit Time">
                <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/40">
                  Flexible — doctor confirms the time
                </div>
              </Field>
            ) : (
              <Field label="Select Time">
                <Select value={time} onValueChange={setTime} disabled={!date || slotsLoading}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 focus:ring-emerald-400/50">
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
                  <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl text-white">
                    {slots.map((t) => (
                      <SelectItem
                        key={t}
                        value={t}
                        className="focus:bg-emerald-400/20 focus:text-white"
                      >
                        {formatTimeDisplay(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-[15px] font-semibold text-white sm:text-sm">Your Details</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="mb-1.5 text-xs font-medium text-white/80">Your Name</div>
                <Input
                  value={name}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="h-11 rounded-xl border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 focus:ring-emerald-400/50"
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-white/80">
                  Phone Number <span className="text-white/40">(optional)</span>
                </div>
                <Input
                  value={phone}
                  type="tel"
                  autoComplete="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 3XX XXXXXXX"
                  className="h-11 rounded-xl border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 focus:ring-emerald-400/50"
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-white/80">
                  Email Address <span className="text-white/40">(optional)</span>
                </div>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 focus:ring-emerald-400/50"
                />
              </div>
              <p className="text-[13px] text-white/60 sm:text-xs sm:col-span-2">
                Provide at least one — we'll send your Appointment ID there.
              </p>
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-[15px] font-medium text-emerald-400 sm:text-sm">{formError}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!serviceId || !date || (!isHomeVisit && !time) || createAppointment.isPending}
            className="mt-6 h-12 w-full rounded-full bg-emerald-500 text-black text-base font-semibold shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-[0.99] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {createAppointment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Book Appointment <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>

          <div className="mt-7 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { Icon: CalendarCheck, t: "Easy Booking", s: "Simple 3 step booking" },
              { Icon: Clock, t: "Flexible Timing", s: "As per your convenience" },
              { Icon: ShieldCheck, t: "Secure & Reliable", s: "Your data is safe with us" },
              { Icon: UserCog, t: "Doctor-Managed", s: "Schedules updated anytime" },
            ].map(({ Icon, t, s }) => (
              <motion.div
                whileHover={{ scale: 1.05 }}
                key={t}
                className="group flex items-center gap-3 p-2 rounded-xl transition-colors hover:bg-white/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/20 transition-transform duration-300 group-hover:-rotate-6">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-[15px] font-semibold text-white sm:text-sm">{t}</div>
                  <div className="text-[13px] text-white/60 sm:text-xs">{s}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-white/80 sm:text-xs">{label}</div>
      {children}
    </div>
  );
}
