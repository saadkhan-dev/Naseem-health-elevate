import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, AlertTriangle, Clock, Loader2, Video, Home, CalendarClock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  useServices,
  useAvailability,
  useTimeSlots,
  useCreateAppointment,
} from "@/hooks/queries/useBookings";
import {
  formatTimeDisplay,
  isHomeVisitService,
  isVideoConsultationService,
  HOME_VISIT_FEE_LABEL,
} from "@/lib/bookings";
import { isDateBeforeTodayClinic } from "@/lib/clinic";
import { saveRecentAppointment } from "@/lib/recent-appointment";
import { BookingConfirmation } from "@/components/site/BookingConfirmation";
import { VideoPaymentStep } from "@/components/site/VideoPaymentStep";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import type { NotificationResult } from "@/lib/notifications";

export const Route = createFileRoute("/booking")({
  validateSearch: z.object({
    mode: z.literal("video").optional(),
  }),
  head: () => ({
    meta: [
      { title: "Book a Slot — Dr. Naseem Ahmed Khan" },
      {
        name: "description",
        content:
          "Check live availability and book your appointment slot with Dr. Naseem Ahmed Khan in Karachi.",
      },
    ],
  }),
  component: BookingPage,
});

function BookingPage() {
  const { mode } = Route.useSearch();
  const isVideoMode = mode === "video";

  const [serviceId, setServiceId] = React.useState<string>();
  const [date, setDate] = React.useState<Date>();
  const [time, setTime] = React.useState<string>();
  const [preferredTime, setPreferredTime] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [appointmentId, setAppointmentId] = React.useState<string | null>(null);
  const [appointmentNo, setAppointmentNo] = React.useState<string | null>(null);
  const [notifications, setNotifications] = React.useState<NotificationResult[]>([]);
  const [chargedAmount, setChargedAmount] = React.useState<number | null>(null);
  const [offerTitle, setOfferTitle] = React.useState<string | null>(null);
  const [isWaived, setIsWaived] = React.useState(false);

  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: availability } = useAvailability();
  const { slots, isLoading: slotsLoading } = useTimeSlots(date, serviceId, services);
  const createAppointment = useCreateAppointment();

  const bookingServices = React.useMemo(
    () =>
      services?.filter((s) =>
        isVideoMode ? isVideoConsultationService(s) : !isVideoConsultationService(s),
      ),
    [services, isVideoMode],
  );
  const selectedService = services?.find((s) => s.id === serviceId);
  const isHomeVisit = selectedService ? isHomeVisitService(selectedService) : false;

  React.useEffect(() => {
    if (isVideoMode && bookingServices && bookingServices.length === 1) {
      setServiceId((prev) => prev ?? bookingServices[0].id);
    }
  }, [isVideoMode, bookingServices]);

  const openDays = React.useMemo(
    () => new Set(availability?.map((a) => a.day_of_week) ?? []),
    [availability],
  );

  async function handleBook() {
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

    setFormError("");
    try {
      const result = await createAppointment.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        serviceId,
        date: format(date, "yyyy-MM-dd"),
        time: isHomeVisit ? undefined : time,
        notes:
          isHomeVisit && preferredTime.trim()
            ? `Preferred visit time: ${preferredTime.trim()}`
            : undefined,
      });

      if (result.error) {
        setFormError(result.error);
      } else {
        setAppointmentId(result.id);
        setAppointmentNo(result.appointmentNo);
        setNotifications(result.notifications);
        setChargedAmount(result.amount);
        setOfferTitle(result.offerTitle);
        setIsWaived(result.paymentStatus === "waived");
        setConfirmed(true);

        if (result.appointmentNo) {
          saveRecentAppointment({
            appointmentNo: result.appointmentNo,
            patientName: name.trim(),
            serviceName: selectedService?.name ?? "",
            date: format(date, "yyyy-MM-dd"),
            time: isHomeVisit ? null : (time ?? null),
            savedAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Booking failed. Please try again.");
    }
  }

  function reset() {
    setConfirmed(false);
    setServiceId(undefined);
    setDate(undefined);
    setTime(undefined);
    setPreferredTime("");
    setName("");
    setPhone("");
    setEmail("");
    setFormError("");
    setAppointmentId(null);
    setAppointmentNo(null);
    setNotifications([]);
    setChargedAmount(null);
    setOfferTitle(null);
    setIsWaived(false);
  }

  const bookingReady =
    confirmed && !!selectedService && !!date && (isVideoMode || isHomeVisit || !!time);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-10 md:px-8 md:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-red-600">
                {isVideoMode ? "Book a Video Consultation" : "Book Your Appointment"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isVideoMode
                  ? selectedService?.duration_minutes
                    ? `Pick a date and ${selectedService.duration_minutes}-minute slot for your online video consultation with Dr. Naseem Ahmed Khan.`
                    : "Pick a date for your online video consultation with Dr. Naseem Ahmed Khan."
                  : "Pick a date to see live available slots. Only open slots are shown."}
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-6">
              <h2 className="font-display text-lg font-semibold text-primary">1. Choose Service</h2>
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v);
                  setTime(undefined);
                  setPreferredTime("");
                }}
                disabled={servicesLoading}
              >
                <SelectTrigger className="mt-3 h-11 w-full rounded-xl">
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

              <h2 className="mt-6 font-display text-lg font-semibold text-primary">
                2. Pick a Date
              </h2>
              <div className="mt-3 rounded-2xl border border-border bg-background p-2">
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
                  className="mx-auto"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {isHomeVisit
                  ? "Home visits are flexible — pick any future date and the doctor will confirm the time."
                  : "Greyed-out dates are closed or already fully booked."}
              </p>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-6">
              {bookingReady ? (
                isVideoMode ? (
                  appointmentId && selectedService ? (
                    <VideoPaymentStep
                      appointmentId={appointmentId}
                      appointmentNo={appointmentNo}
                      amount={chargedAmount ?? selectedService.price}
                      offerTitle={offerTitle}
                      isWaived={isWaived}
                      date={date!}
                      time={time!}
                      patientName={name.trim()}
                      onClose={reset}
                    />
                  ) : null
                ) : (
                  <BookingConfirmation
                    serviceName={selectedService!.name}
                    patientName={name.trim()}
                    date={date!}
                    time={isHomeVisit ? null : (time ?? null)}
                    appointmentNo={appointmentNo}
                    notifications={notifications}
                    onClose={reset}
                  />
                )
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-lg font-semibold text-primary">
                      {isHomeVisit ? "Visit Details" : "3. Available Slots"}
                    </h2>
                    {date && (
                      <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                        {format(date, "EEEE, MMMM d, yyyy")}
                      </span>
                    )}
                  </div>

                  {isHomeVisit ? (
                    <div className="mt-6 rounded-2xl border border-border bg-background p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                          <Home className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Flexible timing — the doctor confirms your visit time
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Home visits have no fixed slots. After booking, Dr. Naseem will call you
                            to agree on the exact time and confirm the fee, which depends on the
                            time and distance.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1.5 text-xs font-medium text-foreground">
                          Preferred Time <span className="text-muted-foreground">(optional)</span>
                        </div>
                        <Input
                          value={preferredTime}
                          onChange={(e) => setPreferredTime(e.target.value)}
                          placeholder="e.g. around 5:00 PM"
                          className="h-11 rounded-xl"
                        />
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1.5 text-xs font-medium text-foreground">
                            Your Name
                          </div>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full name"
                            className="h-11 rounded-xl"
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
                            className="h-11 rounded-xl"
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
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                          Provide at least one — we'll send your Appointment ID there.
                        </p>
                      </div>

                      {formError && (
                        <p className="mt-3 text-sm font-medium text-destructive">{formError}</p>
                      )}

                      <Button
                        onClick={handleBook}
                        disabled={createAppointment.isPending}
                        className="mt-4 h-12 w-full rounded-xl"
                      >
                        {createAppointment.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Booking...
                          </>
                        ) : (
                          <>
                            <Home className="h-4 w-4" /> Request Home Visit
                          </>
                        )}
                      </Button>
                    </div>
                  ) : !date ? (
                    <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background py-14 text-center">
                      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
                      <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                        Select a date on the calendar to see the available time slots.
                      </p>
                    </div>
                  ) : slotsLoading ? (
                    <div className="mt-6 flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" /> Checking available slots...
                    </div>
                  ) : slots.length === 0 ? (
                    <Alert variant="destructive" className="mt-6">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Slot Not Available at the Moment</AlertTitle>
                      <AlertDescription>
                        No open slots remain for {format(date, "EEEE, MMMM d")}. Please choose
                        another date or contact the clinic for assistance.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="mt-6">
                      <p className="text-sm text-muted-foreground">
                        {slots.length} open slot{slots.length === 1 ? "" : "s"} available. Select a
                        time to book.
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {slots.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setTime(t);
                            }}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                              time === t
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground hover:bg-muted",
                            )}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            {formatTimeDisplay(t)}
                          </button>
                        ))}
                      </div>

                      {isVideoMode && selectedService && (
                        <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
                          <Video className="h-4 w-4 text-primary" />
                          <span className="text-muted-foreground">
                            Online Video Consultation
                            {selectedService.duration_minutes
                              ? ` · ${selectedService.duration_minutes} min`
                              : ""}{" "}
                            ·{" "}
                            <span className="font-bold text-foreground">
                              Rs. {selectedService.price}
                            </span>{" "}
                            <span className="font-medium text-primary">prepaid</span>
                          </span>
                        </div>
                      )}

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1.5 text-xs font-medium text-foreground">
                            Your Name
                          </div>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full name"
                            className="h-11 rounded-xl"
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
                            className="h-11 rounded-xl"
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
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                          Provide at least one — we'll send your Appointment ID there.
                        </p>
                      </div>

                      {formError && (
                        <p className="mt-3 text-sm font-medium text-destructive">{formError}</p>
                      )}

                      <Button
                        onClick={handleBook}
                        disabled={!time || createAppointment.isPending}
                        className="mt-4 h-12 w-full rounded-xl"
                      >
                        {createAppointment.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Booking...
                          </>
                        ) : (
                          <>
                            <CalendarClock className="h-4 w-4" />
                            {isVideoMode ? "Book Video Consultation" : "Book Appointment"}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
