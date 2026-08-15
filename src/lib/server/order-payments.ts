import type { SupabaseClient } from "@supabase/supabase-js";
import { createPatientNotification } from "./patient-notifications";

/**
 * Server-side order payment operations.
 *
 * Lives outside the TanStack server functions (`actions.functions.ts`) so tests
 * can exercise the exact same logic directly against the live DB — the same
 * pattern as `server/video-payments.ts`.
 *
 * Order payments follow the video-consultation manual model: the patient
 * submits proof (transaction/reference ID and/or a receipt screenshot), the
 * payment moves to `payment_submitted`, and the clinic verifies it manually.
 * The order stays fully placeable for guests too, so the same identifier-based
 * ownership check (Order ID + phone/email) is used for public submissions.
 */

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:@/+-]+$/;

/** Receipt screenshot uploads: private storage bucket, size + image types only. */
const RECEIPT_BUCKET = "payment-receipts";
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

interface OrderRow {
  id: string;
  patient_id: string | null;
  order_no: string | null;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_payer_name: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_receipt_url: string | null;
}

async function loadOrder(admin: SupabaseClient, orderId: string): Promise<OrderRow | null> {
  const { data } = await admin
    .from("orders")
    .select(
      "id, patient_id, order_no, status, payment_status, payment_amount, payment_method, payment_reference, payment_payer_name, payment_submitted_at, payment_verified_at, payment_receipt_url",
    )
    .eq("id", orderId)
    .maybeSingle();
  return (data ?? null) as OrderRow | null;
}

/**
 * Record the patient's payment proof for an order. The order must be active
 * (not cancelled) and its payment must be pending or failed (a rejected
 * payment can be resubmitted; an already submitted/verified one cannot).
 */
export async function submitOrderPaymentForOrder(
  admin: SupabaseClient,
  input: { orderId: string; methodId: string; reference: string; payerName: string },
): Promise<{ error: string | null }> {
  const order = await loadOrder(admin, input.orderId);
  if (!order) return { error: "Order not found." };
  if (order.status === "cancelled") return { error: "This order is no longer active." };
  if (order.payment_status === "waived") {
    return { error: "No payment is needed — this order was fully covered." };
  }
  if (
    order.payment_status !== "payment_pending" &&
    order.payment_status !== "payment_failed"
  ) {
    return { error: "Payment has already been submitted for this order." };
  }

  const { data: method } = await admin
    .from("payment_methods")
    .select("id, name")
    .eq("id", input.methodId)
    .eq("is_active", true)
    .maybeSingle();
  if (!method) return { error: "That payment method is not available." };

  const { error } = await admin
    .from("orders")
    .update({
      payment_status: "payment_submitted",
      payment_method: method.name,
      payment_reference: input.reference.trim(),
      payment_payer_name: input.payerName.trim(),
      payment_submitted_at: new Date().toISOString(),
      payment_amount: order.payment_amount ?? order.payment_amount,
    })
    .eq("id", input.orderId);
  return { error: error?.message ?? null };
}

/**
 * Find an order by the patient-facing identifier (Order ID / legacy UUID / the
 * transaction reference) AND the phone/email used at checkout. Only the most
 * recent match is used.
 */
async function findOrderByIdentifier(
  admin: SupabaseClient,
  input: { id: string; phone?: string; email?: string },
): Promise<OrderRow | null> {
  const id = input.id.trim();
  if (!id) return null;
  if (!IDENTIFIER_PATTERN.test(id)) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let query = admin
    .from("orders")
    .select(
      "id, patient_id, order_no, status, payment_status, payment_amount, payment_method, payment_reference, payment_payer_name, payment_submitted_at, payment_verified_at, payment_receipt_url",
    )
    .order("created_at", { ascending: false })
    .limit(1);

  if (isUuid) {
    query = query.or(`id.eq.${id},order_no.eq.${id},payment_reference.eq.${id}`);
  } else {
    query = query.or(`order_no.eq.${id},payment_reference.eq.${id}`);
  }

  if (input.email) query = query.eq("email", input.email);
  if (input.phone) query = query.eq("phone", input.phone);

  const { data } = await query.maybeSingle();
  return (data ?? null) as OrderRow | null;
}

/**
 * Public guest submission: record the payment proof for an order using the
 * Order ID + phone/email used at checkout (guests have no account to attach
 * the order to).
 */
export async function submitOrderPaymentByIdentifier(
  admin: SupabaseClient,
  input: {
    id: string;
    phone?: string;
    email?: string;
    methodId: string;
    reference: string;
    payerName: string;
  },
): Promise<{ error: string | null }> {
  const order = await findOrderByIdentifier(admin, input);
  if (!order) return { error: "No order found for that ID and contact details." };
  if (order.status === "cancelled") return { error: "This order is no longer active." };
  if (order.payment_status === "waived") {
    return { error: "No payment is needed — this order was fully covered." };
  }
  if (
    order.payment_status !== "payment_pending" &&
    order.payment_status !== "payment_failed"
  ) {
    return { error: "Payment has already been submitted for this order." };
  }

  const { data: method } = await admin
    .from("payment_methods")
    .select("id, name")
    .eq("id", input.methodId)
    .eq("is_active", true)
    .maybeSingle();
  if (!method) return { error: "That payment method is not available." };

  const { error } = await admin
    .from("orders")
    .update({
      payment_status: "payment_submitted",
      payment_method: method.name,
      payment_reference: input.reference.trim(),
      payment_payer_name: input.payerName.trim(),
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (!error && order.patient_id) {
    await createPatientNotification(admin, {
      userId: order.patient_id,
      type: "payment",
      title: "Payment proof received",
      body: `Your payment for order ${order.order_no ?? ""} was submitted. The clinic will verify it.`,
      link: "/patient/orders",
    });
  }
  return { error: error?.message ?? null };
}

/**
 * Public guest submission: upload a payment receipt screenshot as proof for an
 * order. Reuses the identifier + contact ownership check and the same state
 * machine (only payment_pending / payment_failed → payment_submitted).
 */
export async function submitOrderPaymentReceipt(
  admin: SupabaseClient,
  input: {
    id: string;
    phone?: string;
    email?: string;
    methodId?: string;
    fileName: string;
    mimeType: string;
    fileBase64: string;
    fileSize: number;
  },
): Promise<{ error: string | null }> {
  const order = await findOrderByIdentifier(admin, input);
  if (!order) return { error: "No order found for that ID and contact details." };
  if (order.status === "cancelled") return { error: "This order is no longer active." };
  if (order.payment_status === "waived") {
    return { error: "No payment is needed — this order was fully covered." };
  }
  if (
    order.payment_status !== "payment_pending" &&
    order.payment_status !== "payment_failed"
  ) {
    return { error: "Payment has already been submitted for this order." };
  }

  const extension = RECEIPT_TYPES[input.mimeType];
  if (!extension) return { error: "Only JPG, JPEG or PNG receipt images are accepted." };
  if (!input.fileBase64 || input.fileSize <= 0 || input.fileSize > RECEIPT_MAX_BYTES) {
    return { error: "Receipt image must be a JPG/JPEG/PNG under 5 MB." };
  }

  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length !== input.fileSize) {
    return { error: "The uploaded receipt file is invalid or empty." };
  }

  const safeName = input.fileName.replace(/[^\w.-]/g, "_").slice(-80) || `receipt.${extension}`;
  const path = `orders/${order.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from(RECEIPT_BUCKET)
    .upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) return { error: `Receipt upload failed: ${uploadError.message}` };

  let methodName: string | null = null;
  if (input.methodId) {
    const { data: method } = await admin
      .from("payment_methods")
      .select("id, name")
      .eq("id", input.methodId)
      .eq("is_active", true)
      .maybeSingle();
    if (!method) return { error: "That payment method is not available." };
    methodName = method.name;
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({
      payment_status: "payment_submitted",
      payment_method: methodName,
      payment_receipt_url: path,
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (updateError) return { error: updateError.message };

  if (order.patient_id) {
    await createPatientNotification(admin, {
      userId: order.patient_id,
      type: "payment",
      title: "Payment proof received",
      body: `Your payment receipt for order ${order.order_no ?? ""} was uploaded. The clinic will verify it.`,
      link: "/patient/orders",
    });
  }
  return { error: null };
}

/**
 * Public patient lookup: verify the payment status of an order by Order ID +
 * phone/email (mirrors the video-consultation status lookup).
 */
export async function verifyOrderPaymentByIdentifier(
  admin: SupabaseClient,
  input: { id: string; phone?: string; email?: string },
): Promise<
  | { error: string; result?: undefined }
  | {
      error: null;
      result: {
        orderNo: string;
        status: string;
        paymentStatus: string;
        paymentMethod: string | null;
        paymentReference: string | null;
        paymentAmount: number | null;
        paymentSubmittedAt: string | null;
        paymentVerifiedAt: string | null;
        receiptUploaded: boolean;
      };
    }
> {
  const order = await findOrderByIdentifier(admin, input);
  if (!order) return { error: "No order found for that ID and contact details." };

  return {
    error: null,
    result: {
      orderNo: order.order_no ?? "",
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      paymentReference: order.payment_reference,
      paymentAmount: order.payment_amount,
      paymentSubmittedAt: order.payment_submitted_at,
      paymentVerifiedAt: order.payment_verified_at,
      receiptUploaded: Boolean(order.payment_receipt_url),
    },
  };
}

/**
 * Admin action: verify or reject an order payment.
 *
 * State machine (mirrors the video flow):
 * - payment_verified → only from payment_submitted
 * - payment_failed   → only from payment_submitted
 * - refunded         → only from payment_verified (genuinely paid)
 * - waived           → only from payment_pending or payment_submitted
 */
export async function setOrderPaymentStatus(
  admin: SupabaseClient,
  input: { orderId: string; status: "payment_verified" | "payment_failed" | "refunded" | "waived" },
): Promise<{ error: string | null }> {
  const order = await loadOrder(admin, input.orderId);
  if (!order) return { error: "Order not found." };

  const currentStatus = order.payment_status;

  if (input.status === "payment_verified" && currentStatus !== "payment_submitted") {
    return { error: "Payment can only be verified after it has been submitted." };
  }
  if (input.status === "payment_failed" && currentStatus !== "payment_submitted") {
    return { error: "Payment can only be marked as failed after it has been submitted." };
  }
  if (input.status === "refunded" && currentStatus !== "payment_verified") {
    return { error: "Only verified (genuinely paid) payments can be refunded." };
  }
  if (input.status === "waived" && currentStatus !== "payment_pending" && currentStatus !== "payment_submitted") {
    return { error: "Payment can only be waived when it is pending or has been submitted." };
  }

  const updates: Record<string, string | number | null> = { payment_status: input.status };
  if (input.status === "payment_verified") {
    updates.payment_verified_at = new Date().toISOString();
    if (order.payment_amount === null) updates.payment_amount = order.payment_amount ?? 0;
  }
  if (input.status === "waived") {
    updates.payment_amount = 0;
  }

  const { error } = await admin.from("orders").update(updates).eq("id", input.orderId);
  if (error) return { error: error?.message ?? null };

  if (order.patient_id) {
    const labels: Record<string, string> = {
      payment_verified: "Payment verified",
      payment_failed: "Payment not accepted",
      refunded: "Payment refunded",
      waived: "Payment waived",
    };
    await createPatientNotification(admin, {
      userId: order.patient_id,
      type: "payment",
      title: labels[input.status] ?? "Payment updated",
      body: `The payment for order ${order.order_no ?? ""} is now "${input.status.replace("payment_", "")}".`,
      link: "/patient/orders",
    });
  }

  return { error: null };
}
