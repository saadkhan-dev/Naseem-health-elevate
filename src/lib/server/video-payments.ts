import type { SupabaseClient } from "@supabase/supabase-js";
import { createPatientNotification } from "./patient-notifications";

/**
 * Server-side prepaid Video Consultation payment operations.
 *
 * Lives outside the TanStack server functions (`actions.functions.ts`) so the
 * e2e tests can exercise the exact same logic directly against the live DB
 * (the framework wrapper can't be invoked from bun) — the same pattern as
 * `server/recover-appointments.ts`.
 *
 * Video consultation is detected by name ("video consultation") so it works
 * regardless of the exact wording in the database.
 */

const VIDEO_KEYWORD = "video consultation";

function isVideoConsultationName(name: string | null | undefined): boolean {
  return Boolean(name && name.toLowerCase().includes(VIDEO_KEYWORD));
}

interface VideoAppointmentRow {
  id: string;
  patient_id: string | null;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  services?: { name?: string | null } | null;
}

async function loadVideoAppointment(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ error: string; row?: undefined } | { error: null; row: VideoAppointmentRow }> {
  const { data: row } = await admin
    .from("appointments")
    .select("id, patient_id, status, payment_status, payment_amount, services:service_id (name)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!row) return { error: "Appointment not found." };

  const services = row.services as { name?: string | null } | null;
  if (!isVideoConsultationName(services?.name)) {
    return { error: "Payment only applies to video consultations." };
  }
  if (row.status === "cancelled" || row.status === "rejected" || row.status === "no_show") {
    return { error: "This appointment is no longer active." };
  }
  return { error: null, row: row as unknown as VideoAppointmentRow };
}

/**
 * Record the patient's prepayment proof for a video consultation.
 * The appointment must be an active video consultation and its payment must
 * be pending or failed (a rejected payment can be resubmitted; an already
 * submitted/verified one cannot).
 */
export async function submitVideoPaymentForAppointment(
  admin: SupabaseClient,
  input: { appointmentId: string; methodId: string; reference: string; payerName: string },
): Promise<{ error: string | null }> {
  const loaded = await loadVideoAppointment(admin, input.appointmentId);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? "Appointment not found." };

  if (loaded.row.payment_status === "waived") {
    return { error: "No payment is needed — this consultation was fully covered." };
  }

  if (
    loaded.row.payment_status !== "payment_pending" &&
    loaded.row.payment_status !== "payment_failed"
  ) {
    return { error: "Payment has already been submitted for this appointment." };
  }

  const { data: method } = await admin
    .from("payment_methods")
    .select("id, name")
    .eq("id", input.methodId)
    .eq("is_active", true)
    .maybeSingle();

  if (!method) return { error: "That payment method is not available." };

  const { error } = await admin
    .from("appointments")
    .update({
      payment_status: "payment_submitted",
      payment_method: method.name,
      payment_reference: input.reference,
      payment_payer_name: input.payerName,
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("id", input.appointmentId);

  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Patient — payment verification (appointment-status page)
//
// The patient proves ownership of an appointment the same way the existing
// status lookup does: an Appointment ID / transaction reference AND the phone
// number or email used at booking. Only safe fields are returned — internal
// UUIDs are never exposed.
// ---------------------------------------------------------------------------

/** Safe characters for the patient-entered Receipt ID / Patient ID. */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:@/+-]+$/;

/** Receipt screenshot uploads: private storage bucket, size + image types only. */
const RECEIPT_BUCKET = "payment-receipts";
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

interface VideoPaymentLookupRow extends VideoAppointmentRow {
  appointment_no: string;
  payment_method: string | null;
  payment_reference: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_receipt_url: string | null;
}

/**
 * Find a video consultation appointment by the patient-facing identifier
 * (Appointment ID, legacy UUID, or the transaction/receipt reference) ANDed
 * with the phone/email used at booking. Only the most recent match is used.
 */
async function findVideoAppointmentByIdentifier(
  admin: SupabaseClient,
  input: { id: string; phone?: string; email?: string },
): Promise<{ error: string; row?: undefined } | { error: null; row: VideoPaymentLookupRow }> {
  const id = input.id.trim();
  if (!id) return { error: "Enter your Receipt ID / Patient ID." };
  if (!IDENTIFIER_PATTERN.test(id)) {
    return { error: "Please enter a valid Receipt ID / Patient ID." };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let query = admin
    .from("appointments")
    .select(
      "id, patient_id, status, payment_status, payment_amount, payment_method, payment_reference, payment_submitted_at, payment_verified_at, payment_receipt_url, appointment_no, services:service_id (name)",
    )
    .order("created_at", { ascending: false })
    .limit(1);

  // The internal `id` is a UUID — only compare against it when the input is a
  // well-formed UUID, otherwise PostgREST raises 22P02. The other two fields
  // accept the short patient-facing code and the transaction reference.
  if (isUuid) {
    query = query.or(`id.eq.${id},appointment_no.eq.${id},payment_reference.eq.${id}`);
  } else {
    query = query.or(`appointment_no.eq.${id},payment_reference.eq.${id}`);
  }

  if (input.email) query = query.eq("patient_email", input.email);
  if (input.phone) query = query.eq("patient_phone", input.phone);

  const { data: row } = await query.maybeSingle();
  if (!row) return { error: "No payment found for that ID and contact details." };

  const services = row.services as { name?: string | null } | null;
  if (!isVideoConsultationName(services?.name)) {
    return { error: "Payment status is only available for video consultations." };
  }

  return { error: null, row: row as unknown as VideoPaymentLookupRow };
}

/**
 * Public patient lookup: verify the payment status of a video consultation by
 * Receipt ID / Patient ID (matched against the Appointment ID or the
 * transaction reference) plus the phone/email used at booking.
 */
export async function verifyVideoPaymentForAppointment(
  admin: SupabaseClient,
  input: { id: string; phone?: string; email?: string },
): Promise<
  | { error: string; result?: undefined }
  | {
      error: null;
      result: {
        appointmentNo: string;
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
  const loaded = await findVideoAppointmentByIdentifier(admin, input);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? "Appointment not found." };

  return {
    error: null,
    result: {
      appointmentNo: loaded.row.appointment_no,
      status: loaded.row.status,
      paymentStatus: loaded.row.payment_status,
      paymentMethod: loaded.row.payment_method,
      paymentReference: loaded.row.payment_reference,
      paymentAmount: loaded.row.payment_amount,
      paymentSubmittedAt: loaded.row.payment_submitted_at,
      paymentVerifiedAt: loaded.row.payment_verified_at,
      receiptUploaded: Boolean(loaded.row.payment_receipt_url),
    },
  };
}

/**
 * Public patient action: submit a payment receipt screenshot as proof for a
 * video consultation. Reuses the same ownership check (identifier + contact
 * details) and the same state machine as the reference-ID submission — the
 * payment can only move from `payment_pending`/`payment_failed` to
 * `payment_submitted`, and the clinic still verifies it manually.
 *
 * The image is uploaded with the service-role client to a private storage
 * bucket (no anon/authenticated policies), so RLS is never bypassed and no
 * secrets reach the frontend.
 */
export async function submitVideoPaymentReceipt(
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
  const loaded = await findVideoAppointmentByIdentifier(admin, input);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? "Appointment not found." };

  if (loaded.row.status === "cancelled" || loaded.row.status === "rejected") {
    return { error: "This appointment is no longer active." };
  }
  if (loaded.row.payment_status === "waived") {
    return { error: "No payment is needed — this consultation was fully covered." };
  }
  if (
    loaded.row.payment_status !== "payment_pending" &&
    loaded.row.payment_status !== "payment_failed"
  ) {
    return { error: "Payment has already been submitted for this appointment." };
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
  const path = `${loaded.row.id}/${crypto.randomUUID()}-${safeName}`;

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
    .from("appointments")
    .update({
      payment_status: "payment_submitted",
      payment_method: methodName,
      payment_receipt_url: path,
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("id", loaded.row.id);
  if (updateError) return { error: updateError.message };

  // Signed-in patients get an in-app notification that proof was received.
  if (loaded.row.patient_id) {
    await createPatientNotification(admin, {
      userId: loaded.row.patient_id,
      type: "payment",
      title: "Payment proof received",
      body: "Your payment receipt was uploaded. The clinic will verify it before your video consultation is unlocked.",
      link: "/patient",
    });
  }

  return { error: null };
}

/**
 * Public patient action: submit a payment transaction/reference ID as proof
 * for a video consultation. Reuses the same ownership check (identifier +
 * contact details) and the same state machine as the receipt upload — the
 * payment can only move from `payment_pending`/`payment_failed` to
 * `payment_submitted`, and the clinic still verifies it manually.
 */
export async function submitVideoPaymentByIdentifier(
  admin: SupabaseClient,
  input: {
    id: string;
    phone?: string;
    email?: string;
    reference: string;
    payerName: string;
    methodId?: string;
  },
): Promise<{ error: string | null }> {
  const loaded = await findVideoAppointmentByIdentifier(admin, input);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? "Appointment not found." };

  if (loaded.row.status === "cancelled" || loaded.row.status === "rejected") {
    return { error: "This appointment is no longer active." };
  }
  if (loaded.row.payment_status === "waived") {
    return { error: "No payment is needed — this consultation was fully covered." };
  }
  if (
    loaded.row.payment_status !== "payment_pending" &&
    loaded.row.payment_status !== "payment_failed"
  ) {
    return { error: "Payment has already been submitted for this appointment." };
  }

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
    .from("appointments")
    .update({
      payment_status: "payment_submitted",
      payment_method: methodName,
      payment_reference: input.reference.trim(),
      payment_payer_name: input.payerName.trim(),
      payment_submitted_at: new Date().toISOString(),
    })
    .eq("id", loaded.row.id);
  if (updateError) return { error: updateError.message };

  // Signed-in patients get an in-app notification that proof was received.
  if (loaded.row.patient_id) {
    await createPatientNotification(admin, {
      userId: loaded.row.patient_id,
      type: "payment",
      title: "Payment proof received",
      body: "Your payment transaction ID was submitted. The clinic will verify it before your video consultation is unlocked.",
      link: "/patient",
    });
  }

  return { error: null };
}

/**
 * Admin action: verify or reject a video consultation payment.
 * Only video consultations can be verified/rejected; verification records the
 * verified_at timestamp.
 *
 * State machine enforcement (requirement 5):
 * - payment_verified  → only from payment_submitted
 * - payment_failed    → only from payment_submitted
 * - refunded          → only from payment_verified (genuinely paid; prevents
 *                       duplicate refunds of never-paid/waived appointments)
 * - waived            → only from payment_pending or payment_submitted (admin
 *                       marks free without/after proof, per requirement 3).
 */
export async function setVideoPaymentStatus(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    status: "payment_verified" | "payment_failed" | "refunded" | "waived";
  },
): Promise<{ error: string | null }> {
  const loaded = await loadVideoAppointment(admin, input.appointmentId);
  if (loaded.error || !loaded.row) return { error: loaded.error ?? "Appointment not found." };

  const { row } = loaded;
  const currentStatus = row.payment_status;

  // Validate state transitions
  if (input.status === "payment_verified") {
    if (currentStatus !== "payment_submitted") {
      return {
        error:
          "Payment can only be verified after it has been submitted. " +
          "Use 'waived' if the consultation is free, or 'payment_failed' if the",
      };
    }
  }

  if (input.status === "payment_failed") {
    if (currentStatus !== "payment_submitted") {
      return {
        error: "Payment can only be marked as failed after it has been submitted.",
      };
    }
  }

  if (input.status === "refunded") {
    if (currentStatus !== "payment_verified") {
      return { error: "Only verified (genuinely paid) payments can be refunded." };
    }
  }

  if (input.status === "waived") {
    // Waived is allowed from pending (no payment taken yet) or submitted
    // (admin decides to waive after proof was provided). Do NOT allow from
    // already-verified or refunded states.
    if (currentStatus !== "payment_pending" && currentStatus !== "payment_submitted") {
      return {
        error: "Payment can only be waived when it is pending or has been submitted.",
      };
    }
  }

  const updates: Record<string, string | number | null> = { payment_status: input.status };
  if (input.status === "payment_verified") {
    updates.payment_verified_at = new Date().toISOString();
    // When verifying, ensure amount is snapshotted — if amount is null,
    // the booking flow should have already set it, but set it to 0 as a
    // safety net so the UI never shows "Rs. 0" ambiguously.
    if (row.payment_amount === null) updates.payment_amount = 0;
  }
  if (input.status === "waived") {
    // A waived consultation costs nothing.
    updates.payment_amount = 0;
  }

  const { error } = await admin.from("appointments").update(updates).eq("id", input.appointmentId);
  if (error) return { error: error?.message ?? null };

  // Signed-in patients get an in-app notification of the payment outcome.
  if (row.patient_id) {
    const labels: Record<string, string> = {
      payment_verified: "Payment verified",
      payment_failed: "Payment not accepted",
      refunded: "Payment refunded",
      waived: "Payment waived",
    };
    await createPatientNotification(admin, {
      userId: row.patient_id,
      type: "payment",
      title: labels[input.status] ?? "Payment updated",
      body: `Your video consultation payment is now "${input.status.replace("payment_", "")}".`,
      link: "/patient",
    });
  }

  return { error: null };
}
