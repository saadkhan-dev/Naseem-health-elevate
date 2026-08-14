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
  Wallet,
  Upload,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Nav } from "@/components/site/Nav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { RecentAppointmentBanner } from "@/components/site/RecentAppointmentBanner";
import { useCheckAppointmentStatus, useRecoverAppointment } from "@/hooks/queries/useBookings";
import { useVerifyVideoPayment, useSubmitPaymentReceipt } from "@/hooks/queries/usePayment";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_BADGES,
  type VideoPaymentVerification,
} from "@/lib/payment";
import { formatTimeDisplay } from "@/lib/bookings";
import type { AppointmentStatus, RecoveredAppointment } from "@/lib/bookings";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/notifications";

export const Route = createFileRoute("/appointment-status")({
  validateSearch: z.object({
    apt: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Check Appointment Status — Dr. Naseem Ahmed Khan" },
      {
        name: "description",
        content:
          "Check the status of your appointment with Dr. Naseem Ahmed Khan using your Appointment ID and phone number or email. Forgot your ID? Find your appointment with the details you used when booking.",
      },
    ],
  }),
  component: AppointmentStatusPage,
});

const STATUS_STYLES: Record<AppointmentStatus["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
  completed: "bg-blue-100 text-blue-700",
  arrived: "bg-teal-100 text-teal-700",
  no_show: "bg-gray-100 text-gray-700",
};

type Mode = "id" | "recover";

function AppointmentStatusPage() {
  const { apt } = Route.useSearch();
  const navigate = useNavigate();

  const [mode, setMode] = React.useState<Mode>("id");

  // Appointment ID lookup
  const [appointmentId, setAppointmentId] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [result, setResult] = React.useState<{
    found: boolean;
    appointment: AppointmentStatus | null;
  } | null>(null);

  // Find My Appointment (recovery)
  const [rName, setRName] = React.useState("");
  const [rPhone, setRPhone] = React.useState("");
  const [rEmail, setREmail] = React.useState("");
  const [rError, setRError] = React.useState("");
  const [recoverResult, setRecoverResult] = React.useState<RecoveredAppointment[] | null>(null);

  const [copiedNo, setCopiedNo] = React.useState<string | null>(null);

  const checkStatus = useCheckAppointmentStatus();
  const recoverStatus = useRecoverAppointment();

  // Payment Verification (video consultations)
  const [pvMode, setPvMode] = React.useState<"verify" | "upload">("verify");
  const [pvId, setPvId] = React.useState("");
  const [pvPhone, setPvPhone] = React.useState("");
  const [pvEmail, setPvEmail] = React.useState("");
  const [pvError, setPvError] = React.useState("");
  const [pvResult, setPvResult] = React.useState<VideoPaymentVerification | null>(null);

  const [upId, setUpId] = React.useState("");
  const [upPhone, setUpPhone] = React.useState("");
  const [upEmail, setUpEmail] = React.useState("");
  const [upFile, setUpFile] = React.useState<File | null>(null);
  const [upError, setUpError] = React.useState("");
  const [upSuccess, setUpSuccess] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const verifyPayment = useVerifyVideoPayment();
  const submitReceipt = useSubmitPaymentReceipt();

  async function handleVerifyPayment(e: React.FormEvent) {
    e.preventDefault();
    setPvError("");
    setPvResult(null);

    if (!pvId.trim()) {
      setPvError("Please enter your Receipt ID / Patient ID.");
      return;
    }
    if (!pvPhone.trim() && !pvEmail.trim()) {
      setPvError("Please enter your phone number or email to verify.");
      return;
    }

    try {
      const res = await verifyPayment.mutateAsync({
        id: pvId.trim(),
        phone: pvPhone,
        email: pvEmail,
      });
      if (res.error) {
        setPvError(res.error);
        return;
      }
      setPvResult(res.result);
    } catch (err) {
      setPvError(err instanceof Error ? err.message : "Could not verify your payment.");
    }
  }

  function pickReceiptFile(f: File) {
    setUpError("");
    setUpSuccess("");
    if (!["image/jpeg", "image/jpg", "image/png"].includes(f.type)) {
      setUpError("Please choose a JPG, JPEG or PNG receipt image.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setUpError("Receipt image must be under 5 MB.");
      return;
    }
    setUpFile(f);
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(new Error("Could not read the receipt image."));
      reader.readAsDataURL(file);
    });
  }

  async function handleUploadReceipt(e: React.FormEvent) {
    e.preventDefault();
    setUpError("");
    setUpSuccess("");

    if (!upId.trim()) {
      setUpError("Please enter your Receipt ID / Patient ID.");
      return;
    }
    if (!upPhone.trim() && !upEmail.trim()) {
      setUpError("Please enter your phone number or email to verify.");
      return;
    }
    if (!upFile) {
      setUpError("Please choose a receipt screenshot (JPG/JPEG/PNG).");
      return;
    }

    try {
      const fileBase64 = await readFileAsBase64(upFile);
      const res = await submitReceipt.mutateAsync({
        id: upId.trim(),
        phone: upPhone,
        email: upEmail,
        fileName: upFile.name,
        mimeType: upFile.type as "image/jpeg" | "image/jpg" | "image/png",
        fileBase64,
        fileSize: upFile.size,
      });
      if (res.error) {
        setUpError(res.error);
        return;
      }
      setUpSuccess(
        "Your payment receipt was uploaded. The clinic will verify it before your video consultation is unlocked.",
      );
      setUpFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setUpError(err instanceof Error ? err.message : "Could not upload your receipt.");
    }
  }

  // Pre-fill the Appointment ID when arriving via ?apt=APT-XXXXXX (from
  // "View Status" on the recent-appointment hint or a recovered card).
  React.useEffect(() => {
    if (apt) {
      setMode("id");
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
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-10 md:px-8 md:py-14">
        <div className="mx-auto max-w-xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>

          <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold text-red-600">
                Check Appointment Status
              </h1>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Check your appointment by entering your Appointment ID, or find it using the phone
                number or email you used while booking.
              </p>
            </div>

            <div className="mb-6 mt-6">
              <RecentAppointmentBanner />
            </div>

            <div className="mt-6 space-y-5">
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
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+92 3XX XXXXXXX"
                        className="h-11 rounded-xl"
                      />
                    </div>

                    <div className="text-center text-xs text-muted-foreground">or</div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-11 rounded-xl"
                      />
                    </div>

                    {formError && (
                      <p className="text-sm font-medium text-destructive">{formError}</p>
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
                    <p className="text-sm font-medium text-foreground">
                      Forgot your Appointment ID?
                    </p>
                    <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                      No problem — find your appointment using the phone number or email you used
                      when booking.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMode("recover")}
                      className="mt-3"
                    >
                      <Search className="h-4 w-4" /> Find My Appointment
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <form onSubmit={handleRecover} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="rName">Full Name</Label>
                      <Input
                        id="rName"
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
                        value={rPhone}
                        onChange={(e) => setRPhone(e.target.value)}
                        placeholder="+92 3XX XXXXXXX"
                        className="h-11 rounded-xl"
                      />
                    </div>

                    <div className="text-center text-xs text-muted-foreground">or</div>

                    <div className="space-y-1.5">
                      <Label htmlFor="rEmail">Email Address</Label>
                      <Input
                        id="rEmail"
                        type="email"
                        value={rEmail}
                        onChange={(e) => setREmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-11 rounded-xl"
                      />
                    </div>

                    {rError && <p className="text-sm font-medium text-destructive">{rError}</p>}

                    <Button
                      type="submit"
                      disabled={recoverStatus.isPending}
                      className="h-11 w-full rounded-xl"
                    >
                      {recoverStatus.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Search className="h-4 w-4" /> Find My Appointment
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
            </div>

            {mode === "id" &&
              result &&
              (result.found ? (
                result.appointment && (
                  <div className="mt-6 rounded-2xl border border-border bg-background p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Appointment ID</div>
                        <div className="font-display text-lg font-bold text-foreground break-all">
                          {result.appointment.appointmentNo}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[result.appointment.status]}`}
                      >
                        {APPOINTMENT_STATUS_LABELS[result.appointment.status]}
                      </span>
                    </div>
                    <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                      <ResultRow label="Service" value={result.appointment.serviceName ?? "—"} />
                      <ResultRow
                        label="Date"
                        value={
                          result.appointment.date
                            ? format(
                                new Date(result.appointment.date + "T00:00:00"),
                                "EEEE, MMMM d, yyyy",
                              )
                            : "—"
                        }
                      />
                      <ResultRow
                        label="Time"
                        value={
                          result.appointment.time ? formatTimeDisplay(result.appointment.time) : "—"
                        }
                      />
                    </div>
                    {result.appointment.video && (
                      <div className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft p-4">
                        {result.appointment.video.vcNo &&
                        result.appointment.video.sessionStatus &&
                        result.appointment.video.sessionStatus !== "completed" &&
                        result.appointment.status === "confirmed" ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Video className="h-5 w-5 text-primary" />
                                <span className="text-sm font-semibold text-foreground">
                                  Video Consultation Ready
                                </span>
                              </div>
                              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium capitalize text-green-700">
                                {result.appointment.video.sessionStatus}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Your online video consultation is ready to join
                              {result.appointment.video.durationMinutes
                                ? ` — ${result.appointment.video.durationMinutes} minute session`
                                : ""}
                              .
                            </p>
                            <Button
                              className="mt-3 w-full"
                              onClick={() =>
                                navigate({
                                  to: "/video/$vcNo",
                                  params: { vcNo: result.appointment!.video!.vcNo! },
                                })
                              }
                            >
                              <Video className="h-4 w-4" /> Join Video Consultation
                            </Button>
                          </>
                        ) : result.appointment.video.sessionStatus === "completed" ? (
                          <p className="text-sm text-foreground">
                            This video consultation has been completed. Thank you for using Dr.
                            Naseem Ahmed Khan's services.
                          </p>
                        ) : (
                          <p className="text-sm text-foreground">
                            Your video consultation will be ready once the doctor starts the call —
                            you will receive the join link here and by message.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="mt-4 text-xs text-muted-foreground">
                      {result.appointment.status === "pending" &&
                        "Your appointment is awaiting confirmation from the clinic."}
                      {result.appointment.status === "confirmed" &&
                        "Your appointment has been confirmed by Dr. Naseem."}
                      {result.appointment.status === "rejected" &&
                        "The clinic could not accept this appointment. Please try another slot."}
                      {result.appointment.status === "cancelled" &&
                        "This appointment was cancelled."}
                      {result.appointment.status === "completed" &&
                        "This appointment has been completed."}
                      {result.appointment.status === "arrived" &&
                        "You have arrived — the clinic will see you shortly."}
                      {result.appointment.status === "no_show" &&
                        "This appointment was marked as a no-show because you did not attend."}
                    </p>
                  </div>
                )
              ) : (
                <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-background p-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">No appointment found</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Double-check your Appointment ID and phone/email, or contact the clinic.
                  </p>
                </div>
              ))}

            {mode === "recover" &&
              recoverResult !== null &&
              (recoverResult.length === 0 ? (
                <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-background p-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">No appointments found</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Double-check your name and phone/email, or contact the clinic.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-muted-foreground">
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
                          <div className="text-xs text-muted-foreground">Appointment ID</div>
                          <div className="font-display text-xl font-bold text-foreground break-all">
                            {a.appointmentNo}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[a.status]}`}
                        >
                          {APPOINTMENT_STATUS_LABELS[a.status]}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
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

          {/* Payment Verification — video consultations (below the Enter ID flow) */}
          <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Wallet className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold text-red-600">
                Payment Verification
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                For video consultations — verify your payment with your Receipt ID / Patient ID, or
                upload your payment receipt screenshot.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setPvMode("verify")}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  pvMode === "verify"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Verify with ID
              </button>
              <button
                type="button"
                onClick={() => setPvMode("upload")}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  pvMode === "upload"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload receipt
              </button>
            </div>

            {pvMode === "verify" ? (
              <div className="mt-5 space-y-4">
                <form onSubmit={handleVerifyPayment} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pvId">Receipt ID / Patient ID</Label>
                    <Input
                      id="pvId"
                      value={pvId}
                      onChange={(e) => setPvId(e.target.value)}
                      placeholder="Appointment ID (APT-7K4M92) or transaction reference"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pvPhone">Phone Number</Label>
                    <Input
                      id="pvPhone"
                      value={pvPhone}
                      onChange={(e) => setPvPhone(e.target.value)}
                      placeholder="+92 3XX XXXXXXX"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="text-center text-xs text-muted-foreground">or</div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pvEmail">Email Address</Label>
                    <Input
                      id="pvEmail"
                      type="email"
                      value={pvEmail}
                      onChange={(e) => setPvEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  {pvError && <p className="text-sm font-medium text-destructive">{pvError}</p>}

                  <Button
                    type="submit"
                    disabled={verifyPayment.isPending}
                    className="h-11 w-full rounded-xl"
                  >
                    {verifyPayment.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Verify Payment
                  </Button>
                </form>

                {pvResult && (
                  <div className="rounded-2xl border border-border bg-background p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Appointment ID</div>
                        <div className="font-display text-lg font-bold break-all text-foreground">
                          {pvResult.appointmentNo}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          PAYMENT_STATUS_BADGES[pvResult.paymentStatus] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[pvResult.paymentStatus] ?? pvResult.paymentStatus}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                      {pvResult.paymentAmount !== null && (
                        <ResultRow label="Amount" value={`Rs. ${pvResult.paymentAmount}`} />
                      )}
                      {pvResult.paymentMethod && (
                        <ResultRow label="Payment method" value={pvResult.paymentMethod} />
                      )}
                      {pvResult.paymentReference && (
                        <ResultRow
                          label="Transaction / Reference ID"
                          value={pvResult.paymentReference}
                        />
                      )}
                      {pvResult.paymentSubmittedAt && (
                        <ResultRow
                          label="Submitted"
                          value={format(
                            new Date(pvResult.paymentSubmittedAt),
                            "MMM d, yyyy 'at' h:mm a",
                          )}
                        />
                      )}
                      {pvResult.paymentVerifiedAt && (
                        <ResultRow
                          label="Verified"
                          value={format(
                            new Date(pvResult.paymentVerifiedAt),
                            "MMM d, yyyy 'at' h:mm a",
                          )}
                        />
                      )}
                      {pvResult.receiptUploaded && (
                        <ResultRow label="Receipt" value="Receipt uploaded" />
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {pvResult.paymentStatus === "payment_verified" &&
                        "Your payment has been verified by the clinic. You'll be able to join the video call once the doctor starts it."}
                      {pvResult.paymentStatus === "payment_submitted" &&
                        "Your payment is awaiting verification by the clinic."}
                      {pvResult.paymentStatus === "payment_failed" &&
                        "Your payment was not accepted. Please check the details and resubmit."}
                      {pvResult.paymentStatus === "payment_pending" &&
                        "No payment has been submitted yet for this consultation."}
                      {pvResult.paymentStatus === "refunded" && "This payment was refunded."}
                      {pvResult.paymentStatus === "waived" &&
                        "No payment is needed — this consultation was fully covered."}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleUploadReceipt} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="upId">Receipt ID / Patient ID</Label>
                  <Input
                    id="upId"
                    value={upId}
                    onChange={(e) => setUpId(e.target.value)}
                    placeholder="Appointment ID (APT-7K4M92) or transaction reference"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="upPhone">Phone Number</Label>
                  <Input
                    id="upPhone"
                    value={upPhone}
                    onChange={(e) => setUpPhone(e.target.value)}
                    placeholder="+92 3XX XXXXXXX"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="text-center text-xs text-muted-foreground">or</div>

                <div className="space-y-1.5">
                  <Label htmlFor="upEmail">Email Address</Label>
                  <Input
                    id="upEmail"
                    type="email"
                    value={upEmail}
                    onChange={(e) => setUpEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-foreground">
                    Payment receipt screenshot
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) pickReceiptFile(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40"
                  >
                    {upFile ? (
                      <ImageIcon className="h-5 w-5 shrink-0 text-primary" />
                    ) : (
                      <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {upFile ? upFile.name : "Choose a receipt screenshot"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        JPG / JPEG / PNG · max 5 MB
                      </div>
                    </div>
                  </button>
                </div>

                {upError && <p className="text-sm font-medium text-destructive">{upError}</p>}

                {upSuccess && (
                  <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                    {upSuccess}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={submitReceipt.isPending}
                  className="h-11 w-full rounded-xl"
                >
                  {submitReceipt.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload Receipt
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
