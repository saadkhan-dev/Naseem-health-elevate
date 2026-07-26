import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, ShieldCheck, CalendarCheck, UserCog, ArrowRight, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useServices, useTimeSlots, useCreateAppointment } from "@/hooks/queries/useBookings";
import { formatTimeDisplay } from "@/lib/bookings";
import { BookingConfirmation } from "./BookingConfirmation";
import { AuthModal } from "@/components/auth/AuthModal";

export function BookingPanel() {
  const { user, loading: authLoading } = useAuth();
  const [serviceId, setServiceId] = React.useState<string>();
  const [date, setDate] = React.useState<Date>();
  const [time, setTime] = React.useState<string>();
  const [authOpen, setAuthOpen] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  const { data: services, isLoading: servicesLoading } = useServices();
  const { slots, isLoading: slotsLoading } = useTimeSlots(date, serviceId, services);
  const createAppointment = useCreateAppointment();

  const selectedService = services?.find((s) => s.id === serviceId);

  async function handleSubmit() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!serviceId || !date || !time) return;

    const result = await createAppointment.mutateAsync({
      patientId: user.id,
      serviceId,
      date: format(date, "yyyy-MM-dd"),
      time,
    });

    if (result.error) {
      alert(result.error);
    } else {
      setConfirmed(true);
    }
  }

  if (confirmed && selectedService && date) {
    return (
      <section id="booking" className="relative -mt-6 px-4 md:-mt-12 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-8">
            <BookingConfirmation
              serviceName={selectedService.name}
              date={date}
              time={time!}
              onClose={() => {
                setConfirmed(false);
                setServiceId(undefined);
                setDate(undefined);
                setTime(undefined);
              }}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section id="booking" className="relative -mt-6 px-4 md:-mt-12 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-8">
            <div className="grid items-end gap-5 lg:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
              <div>
                <h2 className="font-display text-2xl font-semibold text-foreground">Book Your Appointment</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user
                    ? `Welcome, ${user.email} — choose your preferred service, date and time.`
                    : "Sign in to book. Choose your preferred service, date and time."}
                </p>
              </div>

              <Field label="Select Service">
                <Select value={serviceId} onValueChange={setServiceId} disabled={servicesLoading}>
                  <SelectTrigger className="h-11 w-full rounded-xl">
                    <SelectValue placeholder={servicesLoading ? "Loading..." : "Select Service"} />
                  </SelectTrigger>
                  <SelectContent>
                    {services?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
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
                        "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-sm",
                        !date && "text-muted-foreground"
                      )}
                    >
                      {date ? format(date, "PPP") : "Select Date"}
                      <CalendarIcon className="ml-2 h-4 w-4 text-primary" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </Field>

              <Field label="Select Time">
                <Select
                  value={time}
                  onValueChange={setTime}
                  disabled={!date || slotsLoading}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl">
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

              <Button
                onClick={handleSubmit}
                disabled={!serviceId || !date || !time || createAppointment.isPending}
                className="h-11 rounded-xl px-6"
              >
                {createAppointment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !user ? (
                  <>
                    Sign in to Book <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    {authLoading ? "Loading..." : "Book Appointment"} <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <div className="mt-7 grid gap-4 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { Icon: CalendarCheck, t: "Easy Booking", s: "Simple 3 step booking" },
                { Icon: Clock, t: "Flexible Timing", s: "As per your convenience" },
                { Icon: ShieldCheck, t: "Secure & Reliable", s: "Your data is safe with us" },
                { Icon: UserCog, t: "Doctor-Managed", s: "Schedules updated anytime" },
              ].map(({ Icon, t, s }) => (
                <div key={t} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-foreground">{t}</div>
                    <div className="text-xs text-muted-foreground">{s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-foreground">{label}</div>
      {children}
    </div>
  );
}
