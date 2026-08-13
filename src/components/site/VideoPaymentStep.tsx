import * as React from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, ShieldCheck, Lock, Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatTimeDisplay } from "@/lib/bookings";
import { usePaymentMethods, useSubmitVideoPayment } from "@/hooks/queries/usePayment";
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
  onClose,
}: VideoPaymentStepProps) {
  const { data: methods, isLoading: methodsLoading } = usePaymentMethods();
  const submit = useSubmitVideoPayment();

  const [methodId, setMethodId] = React.useState<string>();
  const [reference, setReference] = React.useState("");
  const [payerName, setPayerName] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [done, setDone] = React.useState(false);

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

  const bookingRows = (
    <div className="mx-auto mt-3 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
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
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{offerTitle}</span> covered the full
            consultation fee.
          </p>
        ) : (
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Your consultation fee was fully covered. Nothing to pay.
          </p>
        )}

        {bookingRows}

        <p className="mt-4 max-w-sm text-xs text-muted-foreground">
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
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Thank you! The clinic will verify your payment of{" "}
          <span className="font-semibold text-foreground">Rs. {amount}</span> manually. Your video
          consultation stays locked until then — you'll be able to join once it's marked{" "}
          <span className="font-medium text-foreground">
            {PAYMENT_STATUS_LABELS.payment_verified}
          </span>
          .
        </p>

        <div className="mt-5 w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-left text-sm">
          <Row label="Appointment ID" value={appointmentNo ?? "—"} mono />
          <Row label="Patient" value={patientName} />
          <Row label="Service" value="Online Video Consultation" />
          <Row label="Date" value={format(date, "EEEE, MMMM d, yyyy")} />
          <Row label="Time" value={formatTimeDisplay(time)} />
          <Row label="Amount" value={`Rs. ${amount}`} />
          <Row label="Payment status" value={PAYMENT_STATUS_LABELS.payment_submitted} />
        </div>

        <p className="mt-4 max-w-sm text-xs text-muted-foreground">
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
        <p className="mt-1 text-sm text-muted-foreground">
          Online Video Consultation —{" "}
          <span className="font-bold text-foreground">Rs. {amount}</span>
        </p>
        {offerTitle && (
          <div className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-left text-xs text-primary">
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
        <div className="text-sm font-semibold text-foreground">1. Choose a payment method</div>

        {methodsLoading ? (
          <div className="mt-2 flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading payment methods...
          </div>
        ) : !methods || methods.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
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
                <div className="text-sm font-semibold text-foreground">{m.name}</div>
                {m.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{m.description}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedMethod && (selectedMethod.instructions || hasMethodDetails(selectedMethod)) && (
          <div className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/60 p-3 text-sm">
            <div className="text-xs font-semibold text-primary">Payment instructions</div>
            {selectedMethod.instructions && (
              <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {selectedMethod.instructions}
              </div>
            )}
            {hasMethodDetails(selectedMethod) && (
              <dl className="mt-2 space-y-1 text-xs">
                {selectedMethod.account_holder_name && (
                  <DetailRow label="Account holder" value={selectedMethod.account_holder_name} />
                )}
                {selectedMethod.bank_name && (
                  <DetailRow label="Bank" value={selectedMethod.bank_name} />
                )}
                {selectedMethod.account_number && (
                  <DetailRow label="Account no." value={selectedMethod.account_number} mono />
                )}
                {selectedMethod.iban && <DetailRow label="IBAN" value={selectedMethod.iban} mono />}
                {selectedMethod.mobile_number && (
                  <DetailRow label="Mobile" value={selectedMethod.mobile_number} mono />
                )}
              </dl>
            )}
          </div>
        )}

        <div className="mt-6 text-sm font-semibold text-foreground">
          2. Enter your payment details
        </div>
        <div className="mt-2 space-y-3">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground">
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
            <div className="mb-1.5 text-xs font-medium text-foreground">Payer Name</div>
            <Input
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="Name the payment was made from"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        {formError && <p className="mt-3 text-sm font-medium text-destructive">{formError}</p>}

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p>
            The clinic verifies prepaid payments manually before the video call is unlocked. This
            keeps consultations secure.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="mt-4 h-12 w-full rounded-xl"
        >
          {submit.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" /> I've made the payment — submit for verification
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Skip for now (book another)
        </button>
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
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-foreground", mono && "font-mono break-all")}>
        {value}
      </span>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-foreground", mono && "font-mono break-all")}>
        {value}
      </span>
    </div>
  );
}
