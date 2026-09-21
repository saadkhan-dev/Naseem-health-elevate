import { supabase } from "@/lib/supabase";
import { submitVideoPayment as submitVideoPaymentServer } from "@/lib/actions.functions";
import { verifyVideoPayment as verifyVideoPaymentServer } from "@/lib/actions.functions";
import { submitPaymentReceipt as submitPaymentReceiptServer } from "@/lib/actions.functions";
import { submitPaymentSchema } from "@/lib/booking-schema";
import { AnalyticsEvents, trackAnalyticsEvent } from "@/lib/analytics";

/**
 * Prepaid Video Consultation payment model.
 *
 * The payment state lives on the appointment row (payment_* columns), so a
 * patient can complete it right after booking — before the admin has even
 * created the video session. The video session stays locked until
 * `payment_verified`.
 */

export type PaymentStatus =
  | "payment_pending"
  | "payment_submitted"
  | "payment_verified"
  | "payment_failed"
  | "refunded"
  | "waived";

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "payment_pending",
  "payment_submitted",
  "payment_verified",
  "payment_failed",
  "refunded",
  "waived",
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  payment_pending: "Payment pending",
  payment_submitted: "Submitted — awaiting verification",
  payment_verified: "Payment verified",
  payment_failed: "Payment rejected",
  refunded: "Refunded",
  waived: "Waived (free)",
};

export const PAYMENT_STATUS_BADGES: Record<PaymentStatus, string> = {
  payment_pending: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30",
  payment_submitted: "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30",
  payment_verified: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30",
  payment_failed: "bg-red-400/15 text-red-300 ring-1 ring-red-400/30",
  refunded: "bg-white/10 text-white/60 ring-1 ring-white/15",
  waived: "bg-teal-400/15 text-teal-300 ring-1 ring-teal-400/30",
};

export interface PaymentMethod {
  id: string;
  name: string;
  description: string | null;
  /** Instructions/account details the patient sees after picking the method. */
  instructions: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  iban: string | null;
  mobile_number: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** Active payment methods (public read), ordered by the admin-set sort order. */
export async function getActivePaymentMethods(): Promise<PaymentMethod[]> {
  const { data } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as PaymentMethod[];
}

/**
 * Shared validation for the patient's prepaid payment submission.
 * Proof = transaction/reference ID + payer name (+ the chosen method).
 * Defined in `booking-schema.ts` (re-exported here for the UI).
 */
export { submitPaymentSchema };

export interface SubmitVideoPaymentInput {
  appointmentId: string;
  methodId: string;
  reference: string;
  payerName: string;
}

export async function submitVideoPayment(input: SubmitVideoPaymentInput): Promise<{
  error: string | null;
}> {
  const result = await submitVideoPaymentServer({ data: input });
  if (!result.error) {
    trackAnalyticsEvent(AnalyticsEvents.paymentSubmitted, {
      metadata: { channel: "video" },
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Patient — Payment Verification (appointment-status page)
// ---------------------------------------------------------------------------

/** Safe, patient-facing payment status for a video consultation. */
export interface VideoPaymentVerification {
  appointmentNo: string;
  status: string;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentAmount: number | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  receiptUploaded: boolean;
}

export interface VerifyVideoPaymentInput {
  /** Appointment ID (e.g. APT-7K4M92), a legacy row UUID, or the transaction reference. */
  id: string;
  phone?: string;
  email?: string;
}

export interface SubmitPaymentReceiptInput extends VerifyVideoPaymentInput {
  /** Payment method the patient used to make the transfer (matches Option 1). */
  methodId?: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/jpg" | "image/png";
  fileBase64: string;
  fileSize: number;
}

export async function verifyVideoPayment(input: VerifyVideoPaymentInput): Promise<{
  error: string | null;
  result: VideoPaymentVerification | null;
}> {
  return verifyVideoPaymentServer({
    data: {
      id: input.id,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
    },
  }) as Promise<{ error: string | null; result: VideoPaymentVerification | null }>;
}

export async function submitPaymentReceipt(input: SubmitPaymentReceiptInput): Promise<{
  error: string | null;
}> {
  const result = await submitPaymentReceiptServer({
    data: {
      id: input.id,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      methodId: input.methodId || undefined,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileBase64: input.fileBase64,
      fileSize: input.fileSize,
    },
  });
  if (!result.error) {
    trackAnalyticsEvent(AnalyticsEvents.paymentSubmitted, {
      metadata: { channel: "video" },
    });
  }
  return result;
}
