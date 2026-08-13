import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("id, status, payment_status, payment_amount, services:service_id (name)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!row) return { error: "Appointment not found." };

  const services = row.services as { name?: string | null } | null;
  if (!isVideoConsultationName(services?.name)) {
    return { error: "Payment only applies to video consultations." };
  }
  if (row.status === "cancelled" || row.status === "rejected") {
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

  return { error: error?.message ?? null };
}
