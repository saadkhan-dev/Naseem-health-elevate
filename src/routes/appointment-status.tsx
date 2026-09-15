import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarCheck,
  Loader2,
  Search,
  AlertTriangle,
  Copy,
  Check,
  Video,
  Package,
  PackageX,
  History,
  ChevronDown,
  ChevronUp,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import {
  useCheckAppointmentStatus,
  useRecoverAppointment,
  useCheckOrderStatus,
  useRecoverOrder,
} from "@/hooks/queries/useBookings";
import { useMyAppointments, useMyOrders } from "@/hooks/queries/usePatient";
import { useAuth } from "@/hooks/useAuth";
import {
  formatTimeDisplay,
  type AppointmentStatus,
  type RecoveredAppointment,
  type RecoveredOrder,
} from "@/lib/bookings";
import type { PatientAppointment, PatientOrder } from "@/lib/patient-data";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/notifications";
import { todayInClinic } from "@/lib/clinic";

export const Route = createFileRoute("/appointment-status")({
  validateSearch: z.object({
    apt: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Check Appointment & Order Status | Rahat Homeo Physio Clinic Karachi" },
      {
        name: "description",
        content:
          "Check your appointment and order status at Rahat Homeo Physio Clinic in Karachi. Signed-in patients see their details instantly — guests can look up by Appointment/Order ID and phone or email.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rahathomeophysioclinic.com/appointment-status" }],
  }),
  component: AppointmentStatusPage,
});

const APPOINTMENT_STATUS_STYLES: Record<AppointmentStatus["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
  completed: "bg-blue-100 text-blue-700",
  arrived: "bg-teal-100 text-teal-700",
  no_show: "bg-gray-100 text-gray-700",
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  payment_pending: "bg-amber-100 text-amber-700",
  payment_submitted: "bg-sky-100 text-sky-700",
  payment_verified: "bg-green-100 text-green-700",
  payment_failed: "bg-red-100 text-red-700",
  refunded: "bg-slate-100 text-slate-600",
  waived: "bg-emerald-100 text-emerald-700",
};

const PAYMENT_LABELS: Record<string, string> = {
  payment_pending: "Payment pending",
  payment_submitted: "Payment submitted",
  payment_verified: "Payment verified",
  payment_failed: "Payment failed",
  refunded: "Refunded",
  waived: "Fee waived",
};

type ManualMode = "id" | "recover";

function AppointmentStatusPage() {
  const { apt } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const signedIn = !!user;

  const myAppointmentsQuery = useMyAppointments(signedIn);
  const myOrdersQuery = useMyOrders(signedIn);
  const appointments = React.useMemo(
    () => (signedIn ? (myAppointmentsQuery.data ?? []) : []),
    [signedIn, myAppointmentsQuery.data],
  );
  const orders = React.useMemo(
    () => (signedIn ? (myOrdersQuery.data ?? []) : []),
    [signedIn, myOrdersQuery.data],
  );

  const [showManualAppointment, setShowManualAppointment] = React.useState(!signedIn);
  const [showManualOrder, setShowManualOrder] = React.useState(!signedIn);
  const [mode, setMode] = React.useState<ManualMode>("id");
  const [selectedApId, setSelectedApId] = React.useState<string | null>(null);

  // Pre-fill the Appointment ID when arriving via ?apt=APT-XXXXXX (from a
  // "View Status" link after booking or a recovered card). If the signed-in
  // patient owns it, select it directly; otherwise use the manual lookup with
  // the ID prefilled (the lookup form handles the prefill itself).
  const appointmentsAvailable =
    signedIn && !myAppointmentsQuery.isLoading && appointments.length > 0;
  React.useEffect(() => {
    if (!apt) return;
    if (signedIn && !appointments.length) return;
    if (appointmentsAvailable) {
      const match = appointments.find(
        (a) => a.appointmentNo?.toLowerCase() === apt.trim().toLowerCase(),
      );
      if (match) {
        setSelectedApId(match.id);
        setShowManualAppointment(false);
        return;
      }
    }
    setShowManualAppointment(true);
  }, [apt, appointmentsAvailable, appointments, signedIn]);

  const selectedAppointment = React.useMemo(() => {
    if (selectedApId) {
      const found = appointments.find((a) => a.id === selectedApId);
      if (found) return found;
    }
    if (!appointmentsAvailable) return null;
    return currentOrFirst(appointments);
  }, [selectedApId, appointments, appointmentsAvailable]);

  if (authLoading) {
    return (
      <PageShell>
        <div className="py-20">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader signedIn={signedIn} />

      <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
        <SectionHeading icon={<CalendarCheck className="h-5 w-5" />} title="Appointment Status" />
        <div className="mt-5">
          {signedIn ? (
            showManualAppointment ? (
              <GuestAppointmentLookup
                mode={mode}
                setMode={setMode}
                onBackToAuto={() => {
                  setShowManualAppointment(false);
                  if (selectedAppointment) setSelectedApId(selectedAppointment.id);
                }}
              />
            ) : (
              <SignedInAppointments
                appointments={appointments}
                selectedAppointment={selectedAppointment}
                loading={myAppointmentsQuery.isLoading}
                onSelect={setSelectedApId}
                onManual={() => setShowManualAppointment(true)}
              />
            )
          ) : (
            <GuestAppointmentLookup mode={mode} setMode={setMode} />
          )}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
        <SectionHeading icon={<Package className="h-5 w-5" />} title="Order Status" />
        <div className="mt-5">
          {signedIn ? (
            showManualOrder ? (
              <GuestOrderLookup onBackToMine={() => setShowManualOrder(false)} />
            ) : (
              <SignedInOrders
                orders={orders}
                loading={myOrdersQuery.isLoading}
                onManual={() => setShowManualOrder(true)}
              />
            )
          ) : (
            <GuestOrderLookup />
          )}
        </div>
      </section>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Page framing
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-10 md:px-8 md:py-14">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function PageHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mt-6 flex flex-col items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <CalendarCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-bold text-red-600">
        Check Appointment &amp; Order Status
      </h1>
      <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
        {signedIn
          ? "You're signed in — your latest appointment and orders are shown below automatically. You can also look up another appointment or order by ID."
          : "To check your appointment or order status, enter its ID along with the phone number or email you used, or find it using the details you provided when booking."}
      </p>
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </div>
      <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guest appointment lookup (ID + phone/email, or "Find My Appointment")
// ---------------------------------------------------------------------------

function GuestAppointmentLookup({
  mode,
  setMode,
  onBackToAuto,
}: {
  mode: ManualMode;
  setMode: (m: ManualMode) => void;
  onBackToAuto?: () => void;
}) {
  const [appointmentId, setAppointmentId] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [result, setResult] = React.useState<{
    found: boolean;
    appointment: AppointmentStatus | null;
  } | null>(null);

  const [rName, setRName] = React.useState("");
  const [rPhone, setRPhone] = React.useState("");
  const [rEmail, setREmail] = React.useState("");
  const [rError, setRError] = React.useState("");
  const [recoverResult, setRecoverResult] = React.useState<RecoveredAppointment[] | null>(null);
  const [copiedNo, setCopiedNo] = React.useState<string | null>(null);

  const checkStatus = useCheckAppointmentStatus();
  const recoverStatus = useRecoverAppointment();

  const { apt } = Route.useSearch();
  React.useEffect(() => {
    if (apt) {
      setAppointmentId(apt);
      setResult(null);
      setRecoverResult(null);
    }
  }, [apt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setResult(null);
    if (!appointmentId.trim()) {
      setFormError("Please enter your Appointment ID.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setFormError("Please enter your phone number or email to verify.");
      return;
    }
    try {
      const res = await checkStatus.mutateAsync({
        appointmentId: appointmentId.trim(),
        phone,
        email,
      });
      if (res.error) {
        setFormError(res.error);
        return;
      }
      setResult({ found: res.found, appointment: res.appointment });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not check your appointment.");
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setRError("");
    setRecoverResult(null);
    if (!rName.trim()) {
      setRError("Please enter your name as used during booking.");
      return;
    }
    if (!rPhone.trim() && !rEmail.trim()) {
      setRError("Please enter your phone number or email to verify.");
      return;
    }
    try {
      const res = await recoverStatus.mutateAsync({
        name: rName.trim(),
        phone: rPhone,
        email: rEmail,
      });
      if (res.error) {
        setRError(res.error);
        return;
      }
      setRecoverResult(res.appointments);
    } catch (err) {
      setRError(err instanceof Error ? err.message : "Could not find your appointment.");
    }
  }

  async function copyNo(no: string) {
    try {
      await navigator.clipboard.writeText(no);
      setCopiedNo(no);
      setTimeout(() => setCopiedNo((cur) => (cur === no ? null : cur)), 2000);
    } catch {
      setCopiedNo(null);
    }
  }

  function viewStatus(no: string) {
    setMode("id");
    setAppointmentId(no);
    setResult(null);
    setRecoverResult(null);
    setFormError("");
  }

  return (
    <div className="space-y-5">
      {onBackToAuto && (
        <button
          type="button"
          onClick={onBackToAuto}
          className="text-sm font-medium text-primary transition-colors hover:underline"
        >
          ← Back to my appointments
        </button>
      )}

      {mode === "id" ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="appointmentId">Appointment ID</Label>
              <Input
                id="appointmentId"
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
                placeholder="Enter your Appointment ID, e.g. APT-7K4M92"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 3XX XXXXXXX"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="text-center text-[13px] text-muted-foreground sm:text-xs">or</div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl"
              />
            </div>

            {formError && (
              <p className="text-[15px] font-medium text-destructive sm:text-sm">{formError}</p>
            )}

            <Button
              type="submit"
              disabled={checkStatus.isPending}
              className="h-11 w-full rounded-xl"
            >
              {checkStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4" /> Check Status
                </>
              )}
            </Button>
          </form>

          <div className="rounded-2xl border border-dashed border-border bg-background p-4 text-center">
            <p className="text-[15px] font-medium text-foreground sm:text-sm">
              Forgot your Appointment ID?
            </p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
              No problem — find your Appointment ID using the{" "}
              <span className="font-medium">name</span>, phone
              <span className="font-medium">number</span> or{" "}
              <span className="font-medium">email</span> you used when booking.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("recover")}
              className="mt-3"
            >
              <Search className="h-4 w-4" /> Find My Appointment Id
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-[15px] font-medium text-foreground sm:text-sm">
              Find My Appointment Id
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground sm:text-xs">
              Enter your name and phone or email to find your Appointment ID. Once you have it, use
              it above to check the status.
            </p>
          </div>
          <form onSubmit={handleRecover} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rName">Full Name</Label>
              <Input
                id="rName"
                autoComplete="name"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Name used while booking"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rPhone">Phone Number</Label>
              <Input
                id="rPhone"
                type="tel"
                autoComplete="tel"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
                placeholder="+92 3XX XXXXXXX"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="text-center text-[13px] text-muted-foreground sm:text-xs">or</div>

            <div className="space-y-1.5">
              <Label htmlFor="rEmail">Email Address</Label>
              <Input
                id="rEmail"
                type="email"
                autoComplete="email"
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl"
              />
            </div>

            {rError && (
              <p className="text-[15px] font-medium text-destructive sm:text-sm">{rError}</p>
            )}

            <Button
              type="submit"
              disabled={recoverStatus.isPending}
              className="h-11 w-full rounded-xl"
            >
              {recoverStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4" /> Find My Appointment Id
                </>
              )}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setMode("id")}
              className="text-sm font-medium text-primary transition-colors hover:underline"
            >
              ← Back to Appointment ID lookup
            </button>
          </div>
        </>
      )}

      {mode === "id" &&
        result &&
        (result.found ? (
          result.appointment && <AppointmentStatusView appointment={result.appointment} />
        ) : (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8 text-muted-foreground" />}
            title="No appointment found"
            message="Double-check your Appointment ID and phone/email, or contact the clinic."
          />
        ))}

      {mode === "recover" &&
        recoverResult !== null &&
        (recoverResult.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8 text-muted-foreground" />}
            title="No appointments found"
            message="Double-check your name and phone/email, or contact the clinic."
          />
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-[15px] text-muted-foreground sm:text-sm">
              Found {recoverResult.length} appointment
              {recoverResult.length === 1 ? "" : "s"} for you.
            </p>
            {recoverResult.map((a) => (
              <div
                key={`${a.appointmentNo}-${a.date}-${a.time}`}
                className="rounded-2xl border border-border bg-background p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] text-muted-foreground sm:text-xs">
                      Appointment ID
                    </div>
                    <div className="font-display text-xl font-bold text-foreground break-all">
                      {a.appointmentNo}
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-[15px] sm:text-sm">
                  <ResultRow label="Patient" value={a.patientName} />
                  <ResultRow label="Service" value={a.serviceName ?? "—"} />
                  <ResultRow
                    label="Date"
                    value={format(new Date(a.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
                  />
                  <ResultRow
                    label="Time"
                    value={a.time ? formatTimeDisplay(a.time) : "To be confirmed by doctor"}
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyNo(a.appointmentNo)}
                  >
                    {copiedNo === a.appointmentNo ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedNo === a.appointmentNo ? "Copied" : "Copy ID"}
                  </Button>
                  <Button type="button" size="sm" onClick={() => viewStatus(a.appointmentNo)}>
                    <CalendarCheck className="h-4 w-4" /> Check Status
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed-in appointments (auto-loaded)
// ---------------------------------------------------------------------------

interface SignedInAppointmentsProps {
  appointments: PatientAppointment[];
  selectedAppointment: PatientAppointment | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onManual: () => void;
}

function SignedInAppointments({
  appointments,
  selectedAppointment,
  loading,
  onSelect,
  onManual,
}: SignedInAppointmentsProps) {
  const [copiedNo, setCopiedNo] = React.useState<string | null>(null);

  async function copyNo(no: string) {
    try {
      await navigator.clipboard.writeText(no);
      setCopiedNo(no);
      setTimeout(() => setCopiedNo((cur) => (cur === no ? null : cur)), 2000);
    } catch {
      setCopiedNo(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="h-8 w-8 text-muted-foreground" />}
        title="No appointments yet"
        message="Book an appointment and it will appear here with its live status."
      >
        <Link to="/booking">
          <Button className="mt-4">
            <CalendarCheck className="h-4 w-4" /> Book an Appointment
          </Button>
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground sm:text-xs">
          Showing your appointments — pick one to see its status.
        </p>
        <button
          type="button"
          onClick={onManual}
          className="text-sm font-medium text-primary transition-colors hover:underline"
        >
          Check a different appointment
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {appointments.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              a.id === selectedAppointment?.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
            title={`${a.serviceName ?? "Appointment"} — ${APPOINTMENT_STATUS_LABELS[a.status]}`}
          >
            {a.appointmentNo ?? "Appointment"}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${APPOINTMENT_STATUS_STYLES[a.status]}`}
            >
              {APPOINTMENT_STATUS_LABELS[a.status]}
            </span>
          </button>
        ))}
      </div>

      {selectedAppointment && (
        <div className="rounded-2xl border border-border bg-background p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] text-muted-foreground sm:text-xs">Appointment ID</div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold text-foreground break-all">
                  {selectedAppointment.appointmentNo ?? selectedAppointment.id}
                </span>
                {selectedAppointment.appointmentNo && (
                  <button
                    type="button"
                    onClick={() => copyNo(selectedAppointment.appointmentNo!)}
                    aria-label="Copy Appointment ID"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    {copiedNo === selectedAppointment.appointmentNo ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${APPOINTMENT_STATUS_STYLES[selectedAppointment.status]}`}
            >
              {APPOINTMENT_STATUS_LABELS[selectedAppointment.status]}
            </span>
          </div>

          <div className="mt-5 space-y-2 border-t border-border pt-4 text-[15px] sm:text-sm">
            <ResultRow label="Service" value={selectedAppointment.serviceName ?? "—"} />
            <ResultRow
              label="Date"
              value={format(new Date(selectedAppointment.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
            />
            <ResultRow
              label="Time"
              value={
                selectedAppointment.time
                  ? formatTimeDisplay(selectedAppointment.time)
                  : "To be confirmed by doctor"
              }
            />
            {selectedAppointment.notes && (
              <ResultRow label="Notes" value={selectedAppointment.notes} />
            )}
          </div>

          {selectedAppointment.isVideo && (
            <VideoConsultationBox
              vcNo={selectedAppointment.vcNo}
              sessionStatus={selectedAppointment.videoSessionStatus}
              durationMinutes={selectedAppointment.durationMinutes}
              appointmentStatus={selectedAppointment.status}
            />
          )}

          <StatusHint status={selectedAppointment.status} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared appointment status card (guest lookup result)
// ---------------------------------------------------------------------------

function AppointmentStatusView({ appointment }: { appointment: AppointmentStatus }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-background p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted-foreground sm:text-xs">Appointment ID</div>
          <div className="font-display text-lg font-bold text-foreground break-all">
            {appointment.appointmentNo}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${APPOINTMENT_STATUS_STYLES[appointment.status]}`}
        >
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </span>
      </div>
      <div className="mt-5 space-y-2 border-t border-border pt-4 text-[15px] sm:text-sm">
        <ResultRow label="Service" value={appointment.serviceName ?? "—"} />
        <ResultRow
          label="Date"
          value={
            appointment.date
              ? format(new Date(appointment.date + "T00:00:00"), "EEEE, MMMM d, yyyy")
              : "—"
          }
        />
        <ResultRow
          label="Time"
          value={appointment.time ? formatTimeDisplay(appointment.time) : "—"}
        />
      </div>
      {appointment.video && (
        <VideoConsultationBox
          vcNo={appointment.video.vcNo}
          sessionStatus={appointment.video.sessionStatus}
          durationMinutes={appointment.video.durationMinutes}
          appointmentStatus={appointment.status}
        />
      )}
      <StatusHint status={appointment.status} />
    </div>
  );
}

function StatusHint({ status }: { status: AppointmentStatus["status"] }) {
  return (
    <p className="mt-4 text-[13px] text-muted-foreground sm:text-xs">
      {status === "pending" && "Your appointment is awaiting confirmation from the clinic."}
      {status === "confirmed" && "Your appointment has been confirmed by Dr. Naseem."}
      {status === "rejected" &&
        "The clinic could not accept this appointment. Please try another slot."}
      {status === "cancelled" && "This appointment was cancelled."}
      {status === "completed" && "This appointment has been completed."}
      {status === "arrived" && "You have arrived — the clinic will see you shortly."}
      {status === "no_show" &&
        "This appointment was marked as a no-show because you did not attend."}
    </p>
  );
}

function VideoConsultationBox({
  vcNo,
  sessionStatus,
  durationMinutes,
  appointmentStatus,
}: {
  vcNo: string | null;
  sessionStatus: "scheduled" | "active" | "completed" | null;
  durationMinutes: number | null;
  appointmentStatus: AppointmentStatus["status"];
}) {
  const navigate = useNavigate();
  return (
    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft p-4">
      {vcNo &&
      sessionStatus &&
      sessionStatus !== "completed" &&
      appointmentStatus === "confirmed" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <Video className="h-5 w-5 shrink-0 text-primary" />
              <span className="text-[15px] font-semibold text-foreground sm:text-sm">
                Video Consultation Ready
              </span>
            </div>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium capitalize text-green-700">
              {sessionStatus}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-xs">
            Your online video consultation is ready to join
            {durationMinutes ? ` — ${durationMinutes} minute session` : ""}.
          </p>
          <Button
            className="mt-3 w-full"
            onClick={() => navigate({ to: "/video/$vcNo", params: { vcNo: vcNo! } })}
          >
            <Video className="h-4 w-4" /> Join Video Consultation
          </Button>
        </>
      ) : sessionStatus === "completed" ? (
        <p className="text-[15px] text-foreground sm:text-sm">
          This video consultation has been completed. Thank you for using Dr. Naseem Ahmed Khan's
          services.
        </p>
      ) : (
        <p className="text-[15px] text-foreground sm:text-sm">
          Your video consultation will be ready once the doctor starts the call — you will receive
          the join link here and by message.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guest order lookup (Order ID + phone/email)
// ---------------------------------------------------------------------------

function GuestOrderLookup({ onBackToMine }: { onBackToMine?: () => void }) {
  const [mode, setMode] = React.useState<ManualMode>("id");
  const [orderNo, setOrderNo] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [result, setResult] = React.useState<{
    found: boolean;
    order: OrderStatusLike | null;
  } | null>(null);
  const [copiedNo, setCopiedNo] = React.useState<string | null>(null);

  const [rName, setRName] = React.useState("");
  const [rPhone, setRPhone] = React.useState("");
  const [rEmail, setREmail] = React.useState("");
  const [rError, setRError] = React.useState("");
  const [recoverResult, setRecoverResult] = React.useState<RecoveredOrder[] | null>(null);

  const checkOrderStatus = useCheckOrderStatus();
  const recoverOrderStatus = useRecoverOrder();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setResult(null);

    if (!orderNo.trim()) {
      setFormError("Please enter your Order ID.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setFormError("Please enter your phone number or email to verify.");
      return;
    }

    try {
      const res = await checkOrderStatus.mutateAsync({
        orderNo: orderNo.trim(),
        phone,
        email,
      });
      if (res.error) {
        setFormError(res.error);
        return;
      }
      setResult({ found: res.found, order: res.order });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not check your order.");
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setRError("");
    setRecoverResult(null);
    if (!rName.trim()) {
      setRError("Please enter your name as used when ordering.");
      return;
    }
    if (!rPhone.trim() && !rEmail.trim()) {
      setRError("Please enter your phone number or email to verify.");
      return;
    }
    try {
      const res = await recoverOrderStatus.mutateAsync({
        name: rName.trim(),
        phone: rPhone,
        email: rEmail,
      });
      if (res.error) {
        setRError(res.error);
        return;
      }
      setRecoverResult(res.orders);
    } catch (err) {
      setRError(err instanceof Error ? err.message : "Could not find your order.");
    }
  }

  async function copyNo(no: string) {
    try {
      await navigator.clipboard.writeText(no);
      setCopiedNo(no);
      setTimeout(() => setCopiedNo((cur) => (cur === no ? null : cur)), 2000);
    } catch {
      setCopiedNo(null);
    }
  }

  function viewStatus(no: string) {
    setMode("id");
    setOrderNo(no);
    setResult(null);
    setRecoverResult(null);
    setFormError("");
  }

  return (
    <div className="space-y-5">
      {onBackToMine && (
        <button
          type="button"
          onClick={onBackToMine}
          className="text-sm font-medium text-primary transition-colors hover:underline"
        >
          ← Back to my orders
        </button>
      )}

      {mode === "id" ? (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orderNo">Order ID</Label>
              <Input
                id="orderNo"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                placeholder="Enter your Order ID, e.g. ORD-2T7H4J"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="oPhone">Phone Number</Label>
              <Input
                id="oPhone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 3XX XXXXXXX"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="text-center text-[13px] text-muted-foreground sm:text-xs">or</div>

            <div className="space-y-1.5">
              <Label htmlFor="oEmail">Email Address</Label>
              <Input
                id="oEmail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl"
              />
            </div>

            {formError && (
              <p className="text-[15px] font-medium text-destructive sm:text-sm">{formError}</p>
            )}

            <Button
              type="submit"
              disabled={checkOrderStatus.isPending}
              className="h-11 w-full rounded-xl"
            >
              {checkOrderStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4" /> Check Order Status
                </>
              )}
            </Button>
          </form>

          <div className="rounded-2xl border border-dashed border-border bg-background p-4 text-center">
            <p className="text-[15px] font-medium text-foreground sm:text-sm">
              Forgot your Order ID?
            </p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
              No problem — find your Order ID using the <span className="font-medium">name</span>,
              phone
              <span className="font-medium">number</span> or{" "}
              <span className="font-medium">email</span> you used when ordering.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("recover")}
              className="mt-3"
            >
              <Search className="h-4 w-4" /> Find My Order Id
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-[15px] font-medium text-foreground sm:text-sm">Find My Order Id</p>
            <p className="mt-1 text-[13px] text-muted-foreground sm:text-xs">
              Enter your name and phone or email to find your Order ID. Once you have it, use it
              above to check the status.
            </p>
          </div>
          <form onSubmit={handleRecover} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="roName">Full Name</Label>
              <Input
                id="roName"
                autoComplete="name"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Name used while ordering"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="roPhone">Phone Number</Label>
              <Input
                id="roPhone"
                type="tel"
                autoComplete="tel"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
                placeholder="+92 3XX XXXXXXX"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="text-center text-[13px] text-muted-foreground sm:text-xs">or</div>

            <div className="space-y-1.5">
              <Label htmlFor="roEmail">Email Address</Label>
              <Input
                id="roEmail"
                type="email"
                autoComplete="email"
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl"
              />
            </div>

            {rError && (
              <p className="text-[15px] font-medium text-destructive sm:text-sm">{rError}</p>
            )}

            <Button
              type="submit"
              disabled={recoverOrderStatus.isPending}
              className="h-11 w-full rounded-xl"
            >
              {recoverOrderStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="h-4 w-4" /> Find My Order Id
                </>
              )}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setMode("id")}
              className="text-sm font-medium text-primary transition-colors hover:underline"
            >
              ← Back to Order ID lookup
            </button>
          </div>
        </>
      )}

      {mode === "id" &&
        result &&
        (result.found ? (
          result.order && <OrderStatusView order={result.order} />
        ) : (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8 text-muted-foreground" />}
            title="No order found"
            message="Double-check your Order ID and phone/email, or contact the clinic."
          />
        ))}

      {mode === "recover" &&
        recoverResult !== null &&
        (recoverResult.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8 text-muted-foreground" />}
            title="No orders found"
            message="Double-check your name and phone/email, or contact the clinic."
          />
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-[15px] text-muted-foreground sm:text-sm">
              Found {recoverResult.length} order
              {recoverResult.length === 1 ? "" : "s"} for you.
            </p>
            {recoverResult.map((o) => (
              <div key={o.orderNo} className="rounded-2xl border border-border bg-background p-5">
                <div>
                  <div className="text-[13px] text-muted-foreground sm:text-xs">Order ID</div>
                  <div className="font-display text-xl font-bold text-foreground break-all">
                    {o.orderNo}
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-[15px] sm:text-sm">
                  <ResultRow label="Placed" value={format(new Date(o.createdAt), "MMM d, yyyy")} />
                  <ResultRow label="Total" value={`Rs. ${o.total.toLocaleString()}`} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyNo(o.orderNo)}
                  >
                    {copiedNo === o.orderNo ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedNo === o.orderNo ? "Copied" : "Copy ID"}
                  </Button>
                  <Button type="button" size="sm" onClick={() => viewStatus(o.orderNo)}>
                    <Package className="h-4 w-4" /> Check Status
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed-in orders (auto-loaded)
// ---------------------------------------------------------------------------

function SignedInOrders({
  orders,
  loading,
  onManual,
}: {
  orders: PatientOrder[];
  loading: boolean;
  onManual: () => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<PackageX className="h-8 w-8 text-muted-foreground" />}
        title="No orders yet"
        message="Order medicines and products from our shop and track them here."
      >
        <Link to="/shop">
          <Button className="mt-4">
            <Package className="h-4 w-4" /> Visit the Shop
          </Button>
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground sm:text-xs">
          Showing your orders — expand one to see the full status timeline.
        </p>
        <button
          type="button"
          onClick={onManual}
          className="text-sm font-medium text-primary transition-colors hover:underline"
        >
          Check an Order ID
        </button>
      </div>

      {orders.map((o) => (
        <OrderStatusView key={o.id} order={toOrderRecord(o)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared order status card
// ---------------------------------------------------------------------------

type OrderStatusLike = {
  orderNo: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  total: number;
  items: { productName: string; price: number; quantity: number }[];
  history: { status: string; note: string | null; createdAt: string }[];
};

function toOrderRecord(o: PatientOrder | OrderStatusLike): OrderStatusLike {
  if ("order_items" in o) {
    return {
      orderNo: o.order_no ?? o.id,
      status: o.status,
      paymentStatus: (o as PatientOrder).payment_status ?? "payment_pending",
      createdAt: o.created_at,
      total: Number(o.total),
      items: (o.order_items ?? []).map((i) => ({
        productName: i.product_name,
        price: Number(i.price),
        quantity: Number(i.quantity),
      })),
      history: (o.status_history ?? []).map((h) => ({
        status: h.status,
        note: h.note,
        createdAt: h.created_at,
      })),
    };
  }
  return o as OrderStatusLike;
}

function OrderStatusView({ order }: { order: OrderStatusLike }) {
  const [expanded, setExpanded] = React.useState(false);
  const timeline = order.history.slice().reverse();
  const needsPayment =
    order.paymentStatus === "payment_pending" || order.paymentStatus === "payment_failed";

  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted-foreground sm:text-xs">Order ID</div>
          <div className="font-display text-lg font-bold text-foreground break-all">
            {order.orderNo}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={`capitalize ${ORDER_STATUS_STYLES[order.status] ?? ORDER_STATUS_STYLES.pending}`}
          >
            {order.status}
          </Badge>
          <Badge
            className={`capitalize ${
              PAYMENT_STATUS_STYLES[order.paymentStatus] ?? PAYMENT_STATUS_STYLES.payment_pending
            }`}
          >
            {PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
          </Badge>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse order status" : "Expand order status"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Placed {format(new Date(order.createdAt), "MMM d, yyyy, h:mm a")}
      </div>

      <div className="mt-3 space-y-1">
        {order.items.map((item, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="min-w-0 break-words text-foreground">
              {item.productName} <span className="text-muted-foreground">× {item.quantity}</span>
            </span>
            <span className="font-medium text-foreground">
              Rs. {(item.price * item.quantity).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Package className="h-4 w-4" /> Total
        </span>
        <span className="text-base font-bold text-foreground">
          Rs. {order.total.toLocaleString()}
        </span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {needsPayment && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Payment pending.</span> Complete your payment so the
                clinic can start processing your order.
              </span>
            </div>
          )}
          {order.paymentStatus === "payment_submitted" && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
              Your payment has been submitted and is awaiting verification by the clinic.
            </div>
          )}

          {timeline.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Order timeline
              </div>
              <ol className="space-y-2">
                {timeline.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                        h.status === order.status ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                    <span>
                      <span className="font-medium capitalize text-foreground">{h.status}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {format(new Date(h.createdAt), "MMM d, h:mm a")}
                      </span>
                      {h.note && (
                        <span className="block text-xs text-muted-foreground">{h.note}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The signed-in patient's most relevant appointment: the soonest upcoming one,
 * falling back to the most recent past appointment (the list is returned
 * newest-first by the server function).
 */
function currentOrFirst(appointments: PatientAppointment[]): PatientAppointment | null {
  if (appointments.length === 0) return null;
  const today = todayInClinic();
  const upcoming = appointments.filter((a) => a.date >= today);
  if (upcoming.length > 0) {
    return upcoming.reduce((best, a) => (a.date < best.date ? a : best));
  }
  return appointments[0];
}

function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-background p-6 text-center">
      {icon}
      <p className="mt-3 text-[15px] font-medium text-foreground sm:text-sm">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground sm:text-xs">{message}</p>
      {children}
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
