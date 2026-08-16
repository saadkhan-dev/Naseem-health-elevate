import * as React from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Lock,
  Wallet,
  ArrowRight,
  Upload,
  ImageIcon,
  Camera,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatTimeDisplay } from "@/lib/bookings";
import {
  usePaymentMethods,
  useSubmitVideoPayment,
  useSubmitPaymentReceipt,
} from "@/hooks/queries/usePayment";
import { PAYMENT_STATUS_LABELS } from "@/lib/payment";

interface VideoPaymentStepProps {
  /** Internal row id of the video appointment (used to submit the payment). */
  appointmentId: string;
  /** Short patient-facing Appointment ID (e.g. APT-7K4M92). */
  appointmentNo: string | null;
  /** Prepaid amount in Rs. (after any offer discount). */
  amount: number;
  /** Offer title when a video offer was applied at booking. */
  offerTitle?: string | null;
  /** When true the consultation was fully waived — no payment is needed. */
  isWaived?: boolean;
  date: Date;
  time: string;
  patientName: string;
  /** Contact details from the booking form — pre-filled for the receipt ownership check. */
  phone?: string;
  email?: string;
  onClose: () => void;
}

/**
 * Prepaid Video Consultation payment step, shown right after the patient books
 * their 15-minute video slot. The patient picks a payment method, follows the
 * clinic's instructions and submits their transaction/reference ID. The video
 * session stays locked until the clinic verifies the payment.
 *
 * When an offer fully waived the fee, no payment is collected — the patient
 * just confirms and waits for the clinic to unlock the session.
 */
export function VideoPaymentStep({
  appointmentId,
  appointmentNo,
  amount,
  offerTitle,
  isWaived = false,
  date,
  time,
  patientName,
  phone,
  email,
  onClose,
}: VideoPaymentStepProps) {
  const { data: methods, isLoading: methodsLoading } = usePaymentMethods();
  const submit = useSubmitVideoPayment();
  const submitReceipt = useSubmitPaymentReceipt();

  const [verificationMode, setVerificationMode] = React.useState<"transaction" | "receipt">(
    "transaction",
  );
  const [methodId, setMethodId] = React.useState<string>();
  const [reference, setReference] = React.useState("");
  const [payerName, setPayerName] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const [upId, setUpId] = React.useState(appointmentNo ?? "");
  const [upPhone, setUpPhone] = React.useState(phone ?? "");
  const [upEmail, setUpEmail] = React.useState(email ?? "");
  const [upFile, setUpFile] = React.useState<File>();
  const [upPreview, setUpPreview] = React.useState<string>();
  const [upError, setUpError] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const selectedMethod = methods?.find((m) => m.id === methodId);

  async function handleSubmit() {
    setFormError("");
    if (!methodId) {
      setFormError("Please choose a payment method.");
      return;
    }
    if (!reference.trim()) {
      setFormError("Please enter the transaction / reference ID from your payment.");
      return;
    }
    if (!payerName.trim()) {
      setFormError("Please enter the name the payment was made from.");
      return;
    }

    try {
      const result = await submit.mutateAsync({
        appointmentId,
        methodId,
        reference: reference.trim(),
        payerName: payerName.trim(),
      });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setDone(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not submit your payment. Try again.");
    }
  }

  function pickReceiptFile(f: File) {
    setUpError("");
    if (!["image/jpeg", "image/jpg", "image/png"].includes(f.type)) {
      setUpError("Please choose a JPG, JPEG or PNG receipt image.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setUpError("Receipt image must be under 5 MB.");
      return;
    }
    setUpFile(f);
    setUpPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  }

  React.useEffect(() => {
    return () => {
      if (upPreview) URL.revokeObjectURL(upPreview);
    };
  }, [upPreview]);

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

    if (!methodId) {
      setUpError("Please choose a payment method.");
      return;
    }
    if (!upId.trim()) {
      setUpError("Please enter your Appointment ID.");
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
        methodId,
        fileName: upFile.name,
        mimeType: upFile.type as "image/jpeg" | "image/jpg" | "image/png",
        fileBase64,
        fileSize: upFile.size,
      });
      if (res.error) {
        setUpError(res.error);
        return;
      }
      setDone(true);
    } catch (err) {
      setUpError(err instanceof Error ? err.message : "Could not upload your receipt.");
    }
  }

  const bookingRows = (
    <div className="mx-auto mt-3 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-[15px] sm:text-sm">
      <Row label="Appointment ID" value={appointmentNo ?? "—"} mono />
      <Row label="Patient" value={patientName} />
      <Row label="Date" value={format(date, "EEEE, MMMM d, yyyy")} />
      <Row label="Time" value={formatTimeDisplay(time)} />
    </div>
  );

  if (isWaived) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
          No Payment Needed — Your Consultation is FREE
        </h3>
        {offerTitle ? (
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
            <span className="font-semibold text-foreground">{offerTitle}</span> covered the full
            consultation fee.
          </p>
        ) : (
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
            Your consultation fee was fully covered. Nothing to pay.
          </p>
        )}

        {bookingRows}

        <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
          The clinic will confirm your appointment and unlock the video call. You'll be able to join
          with your Video Consultation ID once confirmed.
        </p>

        <Button className="mt-6" onClick={onClose}>
          Book another appointment
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
          Payment Submitted for Verification
        </h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-sm">
          Thank you! The clinic will verify your payment of{" "}
          <span className="font-semibold text-foreground">Rs. {amount}</span> manually. Your video
          consultation stays locked until then — you'll be able to join once it's marked{" "}
          <span className="font-medium text-foreground">
            {PAYMENT_STATUS_LABELS.payment_verified}
          </span>
          .
        </p>

        <div className="mt-5 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-[15px] sm:text-sm">
          <Row label="Appointment ID" value={appointmentNo ?? "—"} mono />
          <Row label="Patient" value={patientName} />
          <Row label="Service" value="Online Video Consultation" />
          <Row label="Date" value={format(date, "EEEE, MMMM d, yyyy")} />
          <Row label="Time" value={formatTimeDisplay(time)} />
          <Row label="Amount" value={`Rs. ${amount}`} />
          <Row label="Payment status" value={PAYMENT_STATUS_LABELS.payment_submitted} />
        </div>

        <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
          Once verified, use the video consultation link you were sent (or ask the clinic for it) to
          join the call with your Video Consultation ID.
        </p>

        <Button className="mt-6" onClick={onClose}>
          Book another appointment
        </Button>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wallet className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
          Complete Your Prepaid Payment
        </h3>
        <p className="mt-1 text-[15px] text-muted-foreground sm:text-sm">
          Online Video Consultation —{" "}
          <span className="font-bold text-foreground">Rs. {amount}</span>
        </p>
        {offerTitle && (
          <div className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-left text-[13px] text-primary sm:text-xs">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Offer applied: <span className="font-semibold">{offerTitle}</span> — you pay{" "}
              <span className="font-bold">Rs. {amount}</span>
            </span>
          </div>
        )}
        {bookingRows}
      </div>

      <div className="mx-auto mt-6 w-full max-w-md">
        <div className="text-[15px] font-semibold text-foreground sm:text-sm">
          Payment Verification
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-2xl bg-muted p-1 min-[400px]:grid-cols-2">
          <button
            type="button"
            onClick={() => setVerificationMode("transaction")}
            className={`rounded-xl px-3 py-2.5 text-center transition-colors ${
              verificationMode === "transaction"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="text-[11px] font-semibold">Option 1</div>
            <div className="text-[15px] font-medium sm:text-sm">Enter Transaction ID</div>
          </button>
          <button
            type="button"
            onClick={() => setVerificationMode("receipt")}
            className={`rounded-xl px-3 py-2.5 text-center transition-colors ${
              verificationMode === "receipt"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="text-[11px] font-semibold">Option 2</div>
            <div className="text-[15px] font-medium sm:text-sm">Upload Payment Receipt</div>
          </button>
        </div>

        {verificationMode === "transaction" ? (
          <>
            <div className="mt-6 text-[15px] font-semibold text-foreground sm:text-sm">
              1. Choose a payment method
            </div>

            {methodsLoading ? (
              <div className="mt-2 flex items-center gap-2 py-4 text-[15px] text-muted-foreground sm:text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading payment methods...
              </div>
            ) : !methods || methods.length === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-border bg-background p-4 text-[15px] text-muted-foreground sm:text-sm">
                Payment methods are being configured by the clinic. Please contact Dr. Naseem to
                complete your payment.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethodId(m.id)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                      methodId === m.id
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    <div className="text-[15px] font-semibold text-foreground sm:text-sm">
                      {m.name}
                    </div>
                    {m.description && (
                      <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
                        {m.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedMethod &&
              (selectedMethod.instructions || hasMethodDetails(selectedMethod)) && (
                <div className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/60 p-3 text-[15px] sm:text-sm">
                  <div className="text-[13px] font-semibold text-primary sm:text-xs">
                    Payment instructions
                  </div>
                  {selectedMethod.instructions && (
                    <div className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                      {selectedMethod.instructions}
                    </div>
                  )}
                  {hasMethodDetails(selectedMethod) && (
                    <dl className="mt-2 space-y-1 text-[13px] sm:text-xs">
                      {selectedMethod.account_holder_name && (
                        <DetailRow
                          label="Account holder"
                          value={selectedMethod.account_holder_name}
                        />
                      )}
                      {selectedMethod.bank_name && (
                        <DetailRow label="Bank" value={selectedMethod.bank_name} />
                      )}
                      {selectedMethod.account_number && (
                        <DetailRow label="Account no." value={selectedMethod.account_number} mono />
                      )}
                      {selectedMethod.iban && (
                        <DetailRow label="IBAN" value={selectedMethod.iban} mono />
                      )}
                      {selectedMethod.mobile_number && (
                        <DetailRow label="Mobile" value={selectedMethod.mobile_number} mono />
                      )}
                    </dl>
                  )}
                </div>
              )}

            <div className="mt-6 text-[15px] font-semibold text-foreground sm:text-sm">
              2. Enter your payment details
            </div>
            <div className="mt-2 space-y-3">
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">
                  Transaction / Reference ID
                </div>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. TRX-123456789"
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">
                  Payer Name
                </div>
                <Input
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Name the payment was made from"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {formError && (
              <p className="mt-3 text-[15px] font-medium text-destructive sm:text-sm">
                {formError}
              </p>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p>
                The clinic verifies prepaid payments manually before the video call is unlocked.
                This keeps consultations secure.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submit.isPending}
              className="mt-4 h-auto min-h-12 w-full rounded-xl px-4 py-3 text-left whitespace-normal"
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="whitespace-normal text-left">
                    I've made the payment — submit for verification
                  </span>
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="mt-3 flex w-full items-center justify-center gap-1.5 text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary sm:text-sm"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Skip for now (book another)
            </button>
          </>
        ) : (
          <form onSubmit={handleUploadReceipt} className="mt-6 space-y-4">
            <div>
              <div className="text-[15px] font-semibold text-foreground sm:text-sm">
                Choose a payment method
              </div>

              {methodsLoading ? (
                <div className="mt-2 flex items-center gap-2 py-4 text-[15px] text-muted-foreground sm:text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading payment methods...
                </div>
              ) : !methods || methods.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-border bg-background p-4 text-[15px] text-muted-foreground sm:text-sm">
                  Payment methods are being configured by the clinic. Please contact Dr. Naseem to
                  complete your payment.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {methods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethodId(m.id)}
                      className={cn(
                        "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                        methodId === m.id
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      <div className="text-[15px] font-semibold text-foreground sm:text-sm">
                        {m.name}
                      </div>
                      {m.description && (
                        <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground sm:text-xs">
                          {m.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">
                Receipt ID / Patient ID
              </div>
              <Input
                value={upId}
                onChange={(e) => setUpId(e.target.value)}
                placeholder="Appointment ID (APT-7K4M92)"
                className="h-11 rounded-xl"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">
                Phone Number
              </div>
              <Input
                value={upPhone}
                onChange={(e) => setUpPhone(e.target.value)}
                placeholder="+92 3XX XXXXXXX"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="text-center text-[13px] text-muted-foreground sm:text-xs">or</div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">
                Email Address
              </div>
              <Input
                type="email"
                value={upEmail}
                onChange={(e) => setUpEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-foreground sm:text-xs">
                Payment receipt screenshot
              </div>
              <input
                ref={fileRef}
                id="receipt-gallery"
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickReceiptFile(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                id="receipt-camera"
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickReceiptFile(f);
                  e.target.value = "";
                }}
              />

              {upPreview ? (
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="relative">
                    <img
                      src={upPreview}
                      alt="Receipt preview"
                      className="max-h-56 w-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUpFile(undefined);
                        setUpPreview(undefined);
                        setUpError("");
                      }}
                      aria-label="Remove receipt"
                      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {upFile?.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {upFile ? `${(upFile.size / (1024 * 1024)).toFixed(1)} MB` : ""}
                      </div>
                    </div>
                    <label
                      htmlFor="receipt-gallery"
                      className="cursor-pointer text-sm font-medium text-primary hover:underline"
                    >
                      Change
                    </label>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                  <label
                    htmlFor="receipt-camera"
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40"
                  >
                    <Camera className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="text-[15px] font-medium text-foreground sm:text-sm">
                      Take Photo
                    </span>
                    <span className="text-[11px] text-muted-foreground">Use the camera</span>
                  </label>
                  <label
                    htmlFor="receipt-gallery"
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary/40"
                  >
                    <ImageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="text-[15px] font-medium text-foreground sm:text-sm">
                      Choose from Gallery
                    </span>
                    <span className="text-[11px] text-muted-foreground">JPG / PNG · max 5 MB</span>
                  </label>
                </div>
              )}
            </div>

            {upError && (
              <p className="text-[15px] font-medium text-destructive sm:text-sm">{upError}</p>
            )}

            <Button
              type="submit"
              disabled={submitReceipt.isPending}
              className="h-12 w-full rounded-xl"
            >
              {submitReceipt.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload Receipt for Verification
                </>
              )}
            </Button>

            {submitReceipt.isPending && (
              <p className="text-center text-[13px] text-muted-foreground sm:text-xs">
                Uploading your receipt, please keep this screen open…
              </p>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center justify-center gap-1.5 text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary sm:text-sm"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Skip for now (book another)
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function hasMethodDetails(m: {
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  iban: string | null;
  mobile_number: string | null;
}): boolean {
  return Boolean(
    m.account_holder_name || m.bank_name || m.account_number || m.iban || m.mobile_number,
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-right font-medium text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-right font-medium text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}
