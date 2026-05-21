import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, ShieldCheck, CalendarCheck, UserCog, ArrowRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/contact";

const SERVICES = [
  "Homeopathic Consultation",
  "Physiotherapy Session",
  "Pain Management",
  "Online Video Consultation",
];

const TIMES = ["10:00 AM", "11:30 AM", "01:00 PM", "03:30 PM", "05:00 PM", "06:30 PM", "07:30 PM"];

export function BookingPanel() {
  const [service, setService] = React.useState<string>();
  const [date, setDate] = React.useState<Date>();
  const [time, setTime] = React.useState<string>();

  const submit = () => {
    const msg = `Hi Dr. Naseem, I'd like to book an appointment.\n\nService: ${service ?? "—"}\nDate: ${date ? format(date, "PPP") : "—"}\nTime: ${time ?? "—"}`;
    window.open(whatsappUrl(msg), "_blank");
  };

  return (
    <section id="booking" className="relative -mt-6 px-4 md:-mt-12 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-8">
          <div className="grid items-end gap-5 lg:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
            <div>
              <h2 className="font-display text-2xl font-semibold text-foreground">Book Your Appointment</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose your preferred service, date and time to book your slot.
              </p>
            </div>

            <Field label="Select Service">
              <Select value={service} onValueChange={setService}>
                <SelectTrigger className="h-11 w-full rounded-xl">
                  <SelectValue placeholder="Select Service" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
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
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Select Time">
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="h-11 w-full rounded-xl">
                  <SelectValue placeholder="Select Time" />
                </SelectTrigger>
                <SelectContent>
                  {TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <button
              onClick={submit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-primary px-6 text-sm font-semibold text-primary-foreground shadow-card transition-transform hover:scale-[1.02]"
            >
              Check Availability <ArrowRight className="h-4 w-4" />
            </button>
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
