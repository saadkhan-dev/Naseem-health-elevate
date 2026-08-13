import { supabase } from "@/lib/supabase";
import { submitVideoPayment as submitVideoPaymentServer } from "@/lib/actions.functions";
import { submitPaymentSchema } from "@/lib/booking-schema";

/**
 * Prepaid Video Consultation payment model.
 *
 * The payment state lives on the appointment row (payment_* columns), so a
 * patient can complete it right after booking — before the admin has even
 * created the Jitsi session. The video session stays locked until
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
  payment_pending: "bg-amber-100 text-amber-800",
  payment_submitted: "bg-blue-100 text-blue-800",
  payment_verified: "bg-emerald-100 text-emerald-800",
  payment_failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-700",
  waived: "bg-teal-100 text-teal-800",
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
  return submitVideoPaymentServer({ data: input });
}
