import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase, staffSupabase } from "@/lib/supabase";
import { getSupabaseAdmin, isAdminOrDoctor } from "./server/supabase-admin";
import { recoverAppointmentsByContact } from "./server/recover-appointments";
import {
  submitVideoPaymentForAppointment,
  setVideoPaymentStatus,
  verifyVideoPaymentForAppointment,
  submitVideoPaymentReceipt,
} from "./server/video-payments";
import { resolveVideoOffer, recordOfferUsage, releaseOfferUsage } from "./server/video-offers";
import {
  createVideoSessionForAppointment,
  getVideoJoinByVcNo as getVideoJoinByVcNoServer,
  resendVideoNotification,
} from "./server/video-sessions";
import { createPatientNotification } from "./server/patient-notifications";
import { validateAppointmentSlot } from "./server/slot-validation";
import {
  createAppointmentReminder,
  sendDueAppointmentReminders as sendDueReminders,
} from "./server/reminders";
import { searchSite } from "./server/search";
import { getAnalytics } from "./server/analytics";
import {
  sendAppointmentNotifications,
  sendStatusChangeNotifications,
  sendRescheduleNotifications,
  getServerNotificationEnv,
  getSiteUrl,
} from "./server/notifications";
import {
  getNotificationConfig,
  type NotificationResult,
  type AppointmentStatusValue,
} from "./notifications";
import {
  bookingSchema,
  recoverSchema,
  submitPaymentSchema,
  verifyPaymentSchema,
  submitReceiptSchema,
} from "./booking-schema";
import { todayInClinic, nowTimeInClinic, toMinutes } from "./clinic";
import { intervalsOverlap } from "./slot-logic";
import { getChatUsageStats, type ChatUsageRange, type ChatUsageStats } from "./server/chat-usage";
import { generateAppointmentNo, generateOrderNo } from "./ids";

/** Max insert attempts when a freshly generated patient-facing ID collides. */
const ID_RETRY_ATTEMPTS = 5;

/**
 * TanStack Start server functions for every WRITE the app performs.
 *
 * Admin/doctor writes run through `adminMiddleware`: the client phase attaches
 * the caller's Supabase access token, and the server phase validates the token
 * (via the service-role client — it cannot be forged) and rejects anyone who is
 * not a `doctor` or `admin`. The service-role key bypasses RLS, so this check
 * is the authorization boundary. Reads stay on the anon client + RLS.
 *
 * `createBooking` is intentionally PUBLIC (guest booking, no login required).
 * It validates the payload server-side and re-checks slot availability to avoid
 * double-booking races.
 */

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid("Invalid id");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

// ---------------------------------------------------------------------------
// Auth middleware (attach token on client, verify role on server)
// ---------------------------------------------------------------------------

export const adminMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    // Admin/doctor session comes from the DEDICATED staff client, never the
    // public/patient one.
    const accessToken =
      typeof window !== "undefined"
        ? ((await staffSupabase.auth.getSession()).data.session?.access_token ?? null)
        : null;
    return next({ sendContext: { accessToken } });
  })
  .server(async ({ next, context }) => {
    const token = context?.accessToken;
    if (!token) {
      throw new Error("Unauthorized");
    }

    const admin = getSupabaseAdmin();
    const { data: userData, error } = await admin.auth.getUser(token);
    if (error || !userData.user) {
      throw new Error("Unauthorized");
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (!profile || (profile.role !== "doctor" && profile.role !== "admin")) {
      throw new Error("Forbidden");
    }

    return next({ context: { adminUserId: userData.user.id } });
  });

/**
 * Attaches the caller's Supabase access token to the server context without
 * requiring a role — used by public functions that return staff-only fields
 * (like the internal session id) only when the caller IS staff.
 */
export const optionalAuthMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const accessToken =
      typeof window !== "undefined"
        ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
        : null;
    return next({ sendContext: { accessToken } });
  })
  .server(async ({ next, context }) => {
    return next({ context: { accessToken: context?.accessToken ?? null } });
  });

/**
 * Attaches BOTH the public/patient token and the staff/admin token. Used only
 * by the video-consultation join lookup, which serves patients (public
 * session) AND doctors/admins (staff session) on the same public route.
 */
export const anyAuthMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const publicToken =
      typeof window !== "undefined"
        ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
        : null;
    const staffToken =
      typeof window !== "undefined"
        ? ((await staffSupabase.auth.getSession()).data.session?.access_token ?? null)
        : null;
    return next({ sendContext: { publicToken, staffToken } });
  })
  .server(async ({ next, context }) => {
    return next({
      context: {
        publicToken: context?.publicToken ?? null,
        staffToken: context?.staffToken ?? null,
      },
    });
  });

/**
 * Requires a signed-in user with a `patient` (or staff) profile role. Used by
 * every patient-dashboard write so ownership can be verified server-side — the
 * patient can only ever act on their OWN appointments/documents/orders.
 */
export const patientMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const accessToken =
      typeof window !== "undefined"
        ? ((await supabase.auth.getSession()).data.session?.access_token ?? null)
        : null;
    return next({ sendContext: { accessToken } });
  })
  .server(async ({ next, context }) => {
    const token = context?.accessToken;
    if (!token) throw new Error("Unauthorized");

    const admin = getSupabaseAdmin();
    const { data: userData, error } = await admin.auth.getUser(token);
    if (error || !userData.user) throw new Error("Unauthorized");

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (
      !profile ||
      (profile.role !== "patient" && profile.role !== "doctor" && profile.role !== "admin")
    ) {
      throw new Error("Forbidden");
    }

    return next({ context: { patientId: userData.user.id } });
  });

// ---------------------------------------------------------------------------
// Public — guest booking (no login)
// ---------------------------------------------------------------------------

export interface CreateBookingResult {
  error: string | null;
  id: string | null;
  /** Short patient-facing appointment number (e.g. "APT-7K4M92"). */
  appointmentNo: string | null;
  /** Delivery results per channel (email / SMS / WhatsApp). Empty when no contact method was given. */
  notifications: NotificationResult[];
  /** Charged amount in Rs. for a video consultation (after any offer); null for other services. */
  amount: number | null;
  /** payment_status snapshot for a video consultation ("payment_pending" | "waived"); null for other services. */
  paymentStatus: string | null;
  /** Offer title when a video offer was applied at booking; null otherwise. */
  offerTitle: string | null;
}

export const createBooking = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(bookingSchema)
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();

    // When the patient is signed in, link the booking to their account so it
    // shows up in their patient dashboard. Guests keep patient_id = null.
    let patientId: string | null = null;
    if (context?.accessToken) {
      const { data: userData } = await admin.auth.getUser(context.accessToken);
      if (userData?.user) patientId = userData.user.id;
    }

    const { data: service } = await admin
      .from("services")
      .select("id, name, price, duration_minutes, is_active")
      .eq("id", data.serviceId)
      .maybeSingle();

    if (!service || service.is_active !== true) {
      return {
        error: "That service is no longer available. Please pick another one.",
        id: null,
        appointmentNo: null,
        notifications: [],
        amount: null,
        paymentStatus: null,
        offerTitle: null,
      };
    }

    // Home Visit has no fixed slot — the doctor confirms the time after
    // booking. Only the date is required.
    const isHomeVisit = service.name.toLowerCase().includes("home visit");
    // Video consultations are always the 15-minute prepaid flow.
    const isVideo = service.name.toLowerCase().includes("video consultation");
    const duration = isVideo ? 15 : (service.duration_minutes ?? 30);

    if (isVideo && (service.duration_minutes ?? 30) !== 15) {
      return {
        error: "Video consultations are 15 minutes. Please contact the clinic for help.",
        id: null,
        appointmentNo: null,
        notifications: [],
        amount: null,
        paymentStatus: null,
        offerTitle: null,
      };
    }

    const today = todayInClinic();
    if (data.date < today) {
      return {
        error: "That date has already passed. Please pick a future date.",
        id: null,
        appointmentNo: null,
        notifications: [],
        amount: null,
        paymentStatus: null,
        offerTitle: null,
      };
    }
    if (data.time && data.date === today && data.time <= nowTimeInClinic()) {
      return {
        error: "That time has already passed. Please pick a later slot.",
        id: null,
        appointmentNo: null,
        notifications: [],
        amount: null,
        paymentStatus: null,
        offerTitle: null,
      };
    }

    if (!isHomeVisit && !data.time) {
      return {
        error: "Please pick a time slot.",
        id: null,
        appointmentNo: null,
        notifications: [],
        amount: null,
        paymentStatus: null,
        offerTitle: null,
      };
    }

    if (!isHomeVisit) {
      const [y, m, d] = data.date.split("-").map(Number);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const interval = duration;
      const timeMin = toMinutes(data.time!);

      const { data: windows } = await admin
        .from("availability")
        .select("start_time, end_time")
        .eq("day_of_week", dayOfWeek)
        .eq("is_available", true);

      const inOpenWindow = (windows ?? []).some((w) => {
        const start = toMinutes(w.start_time);
        const end = toMinutes(w.end_time);
        if (timeMin < start || timeMin >= end || timeMin + interval > end) return false;
        return (timeMin - start) % interval === 0;
      });

      if (!inOpenWindow) {
        return {
          error: "That slot is not available. Please pick an open slot.",
          id: null,
          appointmentNo: null,
          notifications: [],
          amount: null,
          paymentStatus: null,
          offerTitle: null,
        };
      }

      const { data: existing } = await admin
        .from("appointments")
        .select("id")
        .eq("date", data.date)
        .eq("time", data.time)
        .not("status", "in", '("cancelled","rejected","no_show")')
        .maybeSingle();

      if (existing) {
        return {
          error: "That slot was just taken. Please pick another time.",
          id: null,
          appointmentNo: null,
          notifications: [],
          amount: null,
          paymentStatus: null,
          offerTitle: null,
        };
      }

      // Duration-aware overlap guard: a new [time, time+duration) slot must
      // not overlap ANY booked appointment for that date (e.g. a 40-minute
      // Physiotherapy at 19:00 blocks a 15-minute booking at 19:15 too).
      const { data: activeRows } = await admin
        .from("appointments")
        .select("time, services:service_id (duration_minutes)")
        .eq("date", data.date)
        .not("status", "in", '("cancelled","rejected","no_show")');

      const overlaps = (activeRows ?? []).some((r) => {
        const t = r.time as string | null;
        if (!t) return false;
        const [th, tm] = t.split(":").map(Number);
        const otherDur =
          (r.services as { duration_minutes?: number | null } | null)?.duration_minutes ?? 30;
        return intervalsOverlap(timeMin, duration, th * 60 + tm, otherDur);
      });

      if (overlaps) {
        return {
          error: "That time overlaps an existing appointment. Please pick another time.",
          id: null,
          appointmentNo: null,
          notifications: [],
          amount: null,
          paymentStatus: null,
          offerTitle: null,
        };
      }
    }

    // Payment snapshot for prepaid video consultations: resolve any offer and
    // fix the charged amount at booking time so the fee shown to the patient
    // never changes even if the offer or service price is edited later.
    let amount: number | null = null;
    let paymentStatus: string | null = null;
    let offerId: string | null = null;
    let offerTitle: string | null = null;
    if (isVideo) {
      const decision = await resolveVideoOffer(admin, {
        servicePrice: service.price,
        phone: data.phone ?? null,
        email: data.email ?? null,
        patientName: data.name,
      });
      amount = decision.amount;
      offerId = decision.offer_id;
      offerTitle = decision.offer_title;
      paymentStatus = amount === 0 ? "waived" : "payment_pending";
    }

    // The internal row id is a random UUID (also the primary key). The
    // patient-facing Appointment ID is a separate short code
    // (`appointment_no`, e.g. APT-7K4M92) that is generated here and kept
    // unique by the database — on the (astronomically rare) collision the
    // insert is retried with a fresh code.
    const id = crypto.randomUUID();

    for (let attempt = 0; attempt < ID_RETRY_ATTEMPTS; attempt++) {
      const appointmentNo = generateAppointmentNo();

      const insertPayload: Record<string, unknown> = {
        id,
        patient_id: patientId,
        patient_name: data.name,
        patient_phone: data.phone ?? null,
        patient_email: data.email ?? null,
        service_id: data.serviceId,
        date: data.date,
        time: data.time ?? null,
        duration_minutes: service.duration_minutes,
        notes: data.notes ?? null,
        status: "pending",
        appointment_no: appointmentNo,
      };
      if (isVideo) {
        insertPayload.payment_status = paymentStatus;
        insertPayload.payment_amount = amount;
        insertPayload.offer_id = offerId;
      }

      const { data: inserted, error } = await admin
        .from("appointments")
        .insert(insertPayload)
        .select("id, appointment_no")
        .single();

      if (!error) {
        // Track which offer this booking consumed (if any), so
        // "new_patients" offers stay one-time per patient.
        if (isVideo && offerId) {
          await recordOfferUsage(admin, {
            offer_id: offerId,
            appointment_id: inserted.id as string,
            patientName: data.name,
            phone: data.phone ?? null,
            email: data.email ?? null,
          });
        }

        // Signed-in patients also get an in-app notification.
        if (patientId) {
          await createPatientNotification(admin, {
            userId: patientId,
            type: "appointment_status",
            title: "Appointment requested",
            body: `Your appointment ${appointmentNo} for ${service.name} on ${data.date} is pending confirmation.`,
            link: "/patient",
          });
        }

        // Best-effort delivery of the Appointment ID. A channel with no provider
        // credentials is reported as not_configured — never faked.
        const siteUrl = getSiteUrl();
        const notifications = await sendAppointmentNotifications({
          appointmentId: appointmentNo,
          patientName: data.name,
          serviceName: service.name,
          date: data.date,
          time: data.time ?? "Flexible",
          statusUrl: siteUrl ? `${siteUrl}/appointment-status` : undefined,
          phone: data.phone,
          email: data.email,
          isVideo,
          amount,
          offerTitle,
        });

        return {
          error: null,
          id: inserted.id as string,
          appointmentNo,
          notifications,
          amount,
          paymentStatus,
          offerTitle,
        };
      }

      // Only the appointment_no unique index is safe to retry on. Any other
      // collision (23505 exact-slot unique index, or 23P01 from the
      // duration-aware overlap exclusion constraint) is a slot double-booking
      // race: another patient grabbed the slot between our availability check
      // and this insert, so it must be reported — never silently retried.
      const isCodeCollision = error.code === "23505" && /appointment_no/i.test(error.message);
      if (!isCodeCollision) {
        const isSlotCollision = error.code === "23505" || error.code === "23P01";
        return {
          error: isSlotCollision
            ? "That slot was just taken. Please pick another time."
            : error.message,
          id: null,
          appointmentNo: null,
          notifications: [],
          amount: null,
          paymentStatus: null,
          offerTitle: null,
        };
      }
    }

    return {
      error: "Could not generate a unique Appointment ID. Please try again.",
      id: null,
      appointmentNo: null,
      notifications: [],
      amount: null,
      paymentStatus: null,
      offerTitle: null,
    };
  });

// ---------------------------------------------------------------------------
// Public — guest appointment status lookup (Appointment ID + phone/email)
// ---------------------------------------------------------------------------

export const checkAppointmentStatus = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        appointmentId: z.string().trim().min(1, "Enter your Appointment ID").max(64),
        phone: z.string().trim().min(7).max(30).optional(),
        email: z.string().trim().email().max(200).toLowerCase().optional(),
      })
      .refine((v) => v.phone || v.email, { message: "Enter your phone number or email." }),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const id = data.appointmentId.trim();

    let query = admin
      .from("appointments")
      .select(
        "id, appointment_no, status, date, time, created_at, service_id, services:service_id (name)",
      );

    // A short patient-facing code (e.g. APT-7K4M92) must never be compared
    // against the uuid `id` column — PostgREST would raise 22P02
    // ("invalid input syntax for type uuid"). Only search `id` when the input
    // is a well-formed UUID (legacy lookups); otherwise match `appointment_no`
    // alone. Either path is ANDed with the phone/email verification below.
    if (uuidSchema.safeParse(id).success) {
      query = query.or(`id.eq.${id},appointment_no.eq.${id}`);
    } else {
      query = query.eq("appointment_no", id);
    }

    if (data.email) query = query.eq("patient_email", data.email);
    if (data.phone) query = query.eq("patient_phone", data.phone);

    const { data: row, error } = await query.maybeSingle();

    if (error || !row) {
      return { error: null, found: false, appointment: null };
    }

    const services = row.services as unknown as { name: string | null } | null;
    const serviceName = services?.name ?? null;

    // For a video consultation, expose the join state (VC code + session
    // status) so the patient's status page can show "waiting / ready / ended".
    // Only safe fields are returned — never the internal UUIDs.
    let video: {
      vcNo: string | null;
      sessionStatus: "scheduled" | "active" | "completed" | null;
      durationMinutes: number | null;
    } | null = null;
    if (serviceName?.toLowerCase().includes("video consultation")) {
      const { data: vs } = await admin
        .from("video_sessions")
        .select("vc_no, status, duration_minutes")
        .eq("appointment_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      video = vs
        ? {
            vcNo: (vs.vc_no as string | null) ?? null,
            sessionStatus: vs.status as "scheduled" | "active" | "completed",
            durationMinutes: (vs.duration_minutes as number | null) ?? null,
          }
        : { vcNo: null, sessionStatus: null, durationMinutes: null };
    }

    return {
      error: null,
      found: true,
      appointment: {
        id: row.id as string,
        appointmentNo: (row.appointment_no as string | null) ?? (row.id as string),
        status: row.status as
          "pending" | "confirmed" | "rejected" | "cancelled" | "completed" | "arrived" | "no_show",
        date: row.date as string,
        time: (row.time as string | null)?.slice(0, 5) ?? null,
        serviceName,
        createdAt: row.created_at as string,
        video,
      },
    };
  });

// ---------------------------------------------------------------------------
// Public — guest appointment recovery ("Find My Appointment")
//
// Security: the patient MUST verify with their name AND (phone OR email) — the
// query never matches on a bare name, so other patients' appointments cannot
// be enumerated by guessing names. Runs on the service-role client like the
// other public server functions. Only the short patient-facing appointment_no
// and the patient's own appointment summary are returned — internal UUIDs are
// never exposed to the patient, and rows that predate the short-ID migration
// (appointment_no IS NULL) are not returned here (they stay reachable through
// the unchanged Appointment ID + phone/email lookup).
//
// The query logic lives in `server/recover-appointments.ts` so it can be
// exercised end-to-end by the e2e tests without the framework wrapper.
// ---------------------------------------------------------------------------

export const recoverAppointment = createServerFn({ method: "POST" })
  .validator(recoverSchema)
  .handler(async ({ data }) => {
    const appointments = await recoverAppointmentsByContact(data);
    return { error: null, appointments };
  });

// ---------------------------------------------------------------------------
// Admin — appointments
// ---------------------------------------------------------------------------

const appointmentStatusSchema = z.enum([
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
  "completed",
  "arrived",
  "no_show",
]);

export const adminUpdateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, status: appointmentStatusSchema }))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();

    // Read the appointment first (service role bypasses RLS, so this is safe):
    // we need the patient's contact details to send the status notification,
    // and we want to report clearly if the appointment no longer exists.
    const { data: row } = await admin
      .from("appointments")
      .select(
        "id, patient_id, appointment_no, patient_name, patient_phone, patient_email, date, time, status, services:service_id (name)",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (!row) {
      return { error: "Appointment not found.", id: null, status: null, notifications: [] };
    }

    const { error } = await admin
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) {
      const isSlotCollision = error.code === "23505" || error.code === "23P01";
      return {
        error: isSlotCollision
          ? "That change conflicts with an existing appointment. Please pick another slot."
          : error.message,
        id: data.id,
        status: null,
        notifications: [],
      };
    }

    // A cancelled/rejected video appointment frees its offer so the patient
    // can use it again on a fresh booking.
    if (data.status === "cancelled" || data.status === "rejected") {
      await releaseOfferUsage(admin, data.id);
    }

    // Signed-in patients get an in-app notification of the status change.
    if (row.patient_id) {
      await createPatientNotification(admin, {
        userId: row.patient_id as string,
        type: "appointment_status",
        title: `Appointment ${data.status}`,
        body: `Your appointment ${(row.appointment_no as string | null) ?? data.id} is now "${data.status}".`,
        link: "/patient",
      });
    }

    // Best-effort patient notification of the status change. Unconfigured
    // channels are reported as not_configured — never faked.
    const services = row.services as unknown as { name: string | null } | null;
    const siteUrl = getSiteUrl();
    const notifications = await sendStatusChangeNotifications({
      appointmentId: (row.appointment_no as string | null) ?? (row.id as string),
      patientName: row.patient_name ?? "Patient",
      serviceName: services?.name ?? null,
      date: row.date as string,
      time: (row.time as string | null)?.slice(0, 5) ?? "Flexible",
      statusUrl: siteUrl ? `${siteUrl}/appointment-status` : undefined,
      phone: row.patient_phone ?? undefined,
      email: row.patient_email ?? undefined,
      newStatus: data.status,
      previousStatus: row.status as AppointmentStatusValue | undefined,
    });

    return { error: null, id: data.id, status: data.status, notifications };
  });

// ---------------------------------------------------------------------------
// Admin — availability
// ---------------------------------------------------------------------------

export const adminUpdateAvailability = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      id: uuidSchema,
      data: z.object({
        start_time: timeSchema.optional(),
        end_time: timeSchema.optional(),
        is_available: z.boolean().optional(),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("availability")
      .update(data.data)
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — services
// ---------------------------------------------------------------------------

const serviceInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  // null = flexible (no fixed slot) — e.g. Home Visit, confirmed by the doctor.
  duration_minutes: z.number().int().min(5).max(480).nullable(),
  price: z.number().min(0),
  is_active: z.boolean().optional(),
});

export const adminCreateService = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(serviceInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("services").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateService = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: serviceInputSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("services").update(data.data).eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeleteService = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("services").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — products
// ---------------------------------------------------------------------------

const productInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  price: z.number().min(0),
  image_url: z.string().max(1000).optional(),
  in_stock: z.boolean().optional(),
});

export const adminCreateProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(productInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("products").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: productInputSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("products").update(data.data).eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("products").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — videos (YouTube library)
// ---------------------------------------------------------------------------

const videoInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  thumbnail_url: z.string().max(1000).optional(),
  video_url: z.string().max(1000).optional(),
  duration: z.string().max(20).optional(),
  is_published: z.boolean().optional(),
});

export const adminCreateVideo = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(videoInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("videos").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateVideo = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: videoInputSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("videos").update(data.data).eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeleteVideo = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("videos").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — conditions (treated diseases)
// ---------------------------------------------------------------------------

const conditionInputSchema = z.object({
  category: z.enum(["homeopathic", "physiotherapy"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(4000).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const adminCreateCondition = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(conditionInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("conditions").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateCondition = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: conditionInputSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("conditions")
      .update(data.data)
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeleteCondition = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("conditions").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — reviews
// ---------------------------------------------------------------------------

const reviewInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(4000).optional(),
  is_active: z.boolean().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const adminCreateReview = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(reviewInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("reviews").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateReview = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: reviewInputSchema.partial() }))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();

    const reviewData = { ...data.data };
    // Approving a review also makes it publicly visible.
    if (reviewData.status === "approved") {
      reviewData.is_active = true;
    }
    if (reviewData.status === "rejected") {
      reviewData.is_active = false;
    }

    const { error } = await admin.from("reviews").update(reviewData).eq("id", data.id);
    if (error) return { error: error?.message ?? null };

    // Notify the author when their review is approved or rejected.
    if (reviewData.status) {
      const { data: review } = await admin
        .from("reviews")
        .select("patient_id, rating, text")
        .eq("id", data.id)
        .maybeSingle();
      if (review?.patient_id) {
        const approved = reviewData.status === "approved";
        await createPatientNotification(admin, {
          userId: review.patient_id,
          type: "review",
          title: approved ? "Review approved" : "Review not approved",
          body: approved
            ? "Great news — your review is now live on the website. Thank you!"
            : "Your submitted review was not approved and is not shown publicly.",
          link: "/patient",
        });
      }
    }
    return { error: null };
  });

export const adminDeleteReview = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("reviews").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — video consultations (Jitsi sessions)
// ---------------------------------------------------------------------------

interface VideoSessionRecord {
  id: string;
  appointment_id: string;
  room_name: string;
  vc_no: string | null;
  status: "scheduled" | "active" | "completed";
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  created_at: string;
}

export const adminCreateVideoSession = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      appointmentId: uuidSchema,
      durationMinutes: z.number().int().min(5).max(120),
    }),
  )
  .handler(async ({ data }) => {
    // Reuses the existing session when the appointment already has one, so
    // the same VC code, Jitsi room and patient join link are used everywhere.
    const result = await createVideoSessionForAppointment(
      getSupabaseAdmin(),
      data.appointmentId,
      data.durationMinutes,
      getSiteUrl(),
    );
    return {
      error: result.error,
      session: result.session as VideoSessionRecord | null,
      created: result.created,
      notifications: result.notifications,
    };
  });

// ---------------------------------------------------------------------------
// Public — join a video consultation by its short VC code
//
// Security: the join lookup goes through the patient-facing VC-XXXXXX code
// only — internal appointment/session UUIDs are never exposed. A doctor/admin
// caller additionally receives the internal session id (needed to mark the
// call completed/active) after their role is verified server-side.
// ---------------------------------------------------------------------------

export const getVideoJoinByVcNo = createServerFn({ method: "POST" })
  .middleware([anyAuthMiddleware])
  .validator(
    z.object({
      vcNo: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^VC-[A-Z0-9]{6}$/, "Invalid video consultation code"),
    }),
  )
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const result = await getVideoJoinByVcNoServer(admin, data.vcNo);

    let sessionId: string | null = null;
    if (result.session && (await isAdminOrDoctor(admin, context?.staffToken))) {
      const { data: s } = await admin
        .from("video_sessions")
        .select("id")
        .eq("vc_no", data.vcNo)
        .maybeSingle();
      sessionId = s?.id ?? null;
    }

    return { ...result, sessionId };
  });

// ---------------------------------------------------------------------------
// Admin — re-send the "video ready" notification (same room/link) or inspect
// the current notification configuration
// ---------------------------------------------------------------------------

export const adminResendVideoNotification = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ appointmentId: uuidSchema }))
  .handler(async ({ data }) => {
    const result = await resendVideoNotification(
      getSupabaseAdmin(),
      data.appointmentId,
      getSiteUrl(),
    );
    return { error: result.error, notifications: result.notifications };
  });

export const adminGetVideoNotificationConfig = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    return {
      ...getNotificationConfig(getServerNotificationEnv()),
      siteUrl: getSiteUrl() ?? null,
    };
  });

export const adminUpdateVideoSessionStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      sessionId: uuidSchema,
      status: z.enum(["scheduled", "active", "completed"]),
    }),
  )
  .handler(async ({ data }) => {
    const updates: { status: string; started_at?: string; ended_at?: string } = {
      status: data.status,
    };
    if (data.status === "active") updates.started_at = new Date().toISOString();
    if (data.status === "completed") updates.ended_at = new Date().toISOString();

    const { error } = await getSupabaseAdmin()
      .from("video_sessions")
      .update(updates)
      .eq("id", data.sessionId);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Public — prepaid Video Consultation payment submission
//
// The patient books the video slot first, then submits their payment proof
// (method + transaction/reference ID + payer name). Logic lives in
// `server/video-payments.ts` so it is exercised end-to-end by the e2e tests
// without the framework wrapper.
// ---------------------------------------------------------------------------

export const submitVideoPayment = createServerFn({ method: "POST" })
  .validator(submitPaymentSchema)
  .handler(async ({ data }) => {
    const error = await submitVideoPaymentForAppointment(getSupabaseAdmin(), data);
    return error;
  });

// ---------------------------------------------------------------------------
// Public — patient payment verification (Receipt ID / Patient ID lookup)
// Ownership is proven with the identifier + phone/email, mirroring the
// appointment-status lookup. Only safe fields are returned.
// ---------------------------------------------------------------------------

export const verifyVideoPayment = createServerFn({ method: "POST" })
  .validator(verifyPaymentSchema)
  .handler(async ({ data }) => {
    const result = await verifyVideoPaymentForAppointment(getSupabaseAdmin(), data);
    return result.error
      ? { error: result.error, result: null }
      : { error: null, result: result.result };
  });

// ---------------------------------------------------------------------------
// Public — patient payment receipt screenshot upload (JPG/JPEG/PNG)
// Uploads to a private storage bucket via the service-role client and marks
// the appointment's payment as submitted for verification.
// ---------------------------------------------------------------------------

export const submitPaymentReceipt = createServerFn({ method: "POST" })
  .validator(submitReceiptSchema)
  .handler(async ({ data }) => {
    const error = await submitVideoPaymentReceipt(getSupabaseAdmin(), data);
    return error;
  });

// ---------------------------------------------------------------------------
// Admin — verify / reject a video consultation payment
// ---------------------------------------------------------------------------

export const adminSetVideoPaymentStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      appointmentId: uuidSchema,
      status: z.enum(["payment_verified", "payment_failed", "refunded", "waived"]),
    }),
  )
  .handler(async ({ data }) => {
    const result = await setVideoPaymentStatus(getSupabaseAdmin(), data);
    return { error: result.error };
  });

// ---------------------------------------------------------------------------
// Admin — video consultation payment status (with offer title)
// ---------------------------------------------------------------------------

export const adminGetVideoPaymentStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ appointmentId: uuidSchema }))
  .handler(async ({ data }) => {
    const { data: row } = await getSupabaseAdmin()
      .from("appointments")
      .select(
        "id, status, payment_status, payment_method, payment_reference, payment_payer_name, payment_submitted_at, payment_verified_at, payment_amount, offer_id, video_offers:offer_id (title)",
      )
      .eq("id", data.appointmentId)
      .maybeSingle();

    if (!row) return { status: null };

    const offer = row.video_offers as unknown as { title: string | null } | null;
    return {
      status: {
        appointmentStatus: row.status,
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method,
        paymentReference: row.payment_reference,
        paymentPayerName: row.payment_payer_name,
        paymentSubmittedAt: row.payment_submitted_at,
        paymentVerifiedAt: row.payment_verified_at,
        paymentAmount: row.payment_amount,
        offerTitle: offer?.title ?? null,
      },
    };
  });

// ---------------------------------------------------------------------------
// Admin — video consultation pricing
// ---------------------------------------------------------------------------

export const adminSetVideoPricing = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ price: z.number().min(0).max(100000) }))
  .handler(async ({ data }) => {
    const { data: services } = await getSupabaseAdmin()
      .from("services")
      .select("id")
      .ilike("name", "%video consultation%");

    const videoService = services?.[0];
    if (!videoService) return { error: "Video consultation service not found." };

    const { error } = await getSupabaseAdmin()
      .from("services")
      .update({ price: Math.round(data.price) })
      .eq("id", videoService.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — video consultation offers (discounts / waivers)
// ---------------------------------------------------------------------------

const videoOfferBaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  offer_type: z.enum(["waive", "percent", "fixed"]),
  discount_percent: z.number().int().min(1).max(100).nullable().optional(),
  discount_amount: z.number().min(0).nullable().optional(),
  start_date: dateSchema,
  end_date: dateSchema.nullable().optional(),
  is_active: z.boolean().optional(),
  eligibility: z.enum(["all", "new_patients"]).optional(),
  terms: z.string().trim().max(2000).nullable().optional(),
});

const videoOfferInputSchema = videoOfferBaseSchema.superRefine((val, ctx) => {
  if (val.offer_type === "percent" && !val.discount_percent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discount_percent"],
      message: "A discount percentage is required for percentage offers.",
    });
  }
  if (val.offer_type === "fixed" && !val.discount_amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discount_amount"],
      message: "A discount amount is required for fixed offers.",
    });
  }
});

export const adminGetVideoOffers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("video_offers")
      .select("*")
      .order("created_at", { ascending: false });
    return { offers: data ?? [] };
  });

export const adminCreateVideoOffer = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(videoOfferInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("video_offers").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateVideoOffer = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: videoOfferBaseSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("video_offers")
      .update(data.data)
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeleteVideoOffer = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("video_offers").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — reschedule an appointment (same slot validation as booking)
// ---------------------------------------------------------------------------

export const adminRescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      id: uuidSchema,
      date: dateSchema,
      time: timeSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();

    const { data: row } = await admin
      .from("appointments")
      .select(
        "id, patient_id, date, time, status, duration_minutes, patient_name, patient_phone, patient_email, appointment_no, service_id, services:service_id (name, duration_minutes)",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (!row) return { error: "Appointment not found." };

    const services = row.services as unknown as {
      name: string | null;
      duration_minutes: number | null;
    } | null;
    const serviceName = services?.name ?? "";
    const isHomeVisit = serviceName.toLowerCase().includes("home visit");
    const isVideo = serviceName.toLowerCase().includes("video consultation");
    const duration = isVideo ? 15 : (services?.duration_minutes ?? row.duration_minutes ?? 30);

    const slotError = await validateAppointmentSlot(admin, {
      date: data.date,
      time: data.time ?? null,
      durationMinutes: duration,
      isHomeVisit,
      excludeId: data.id,
    });
    if (slotError) return { error: slotError };

    const { error } = await admin
      .from("appointments")
      .update({ date: data.date, time: data.time ?? null })
      .eq("id", data.id);
    if (error) {
      const isSlotCollision = error.code === "23505" || error.code === "23P01";
      return {
        error: isSlotCollision
          ? "That slot was just taken. Please pick another time."
          : error.message,
      };
    }

    // Signed-in patients get an in-app notification of the new slot.
    if (row.patient_id) {
      await createPatientNotification(admin, {
        userId: row.patient_id as string,
        type: "appointment_rescheduled",
        title: "Appointment rescheduled",
        body: `Your appointment ${(row.appointment_no as string | null) ?? data.id} was moved to ${data.date}${data.time ? ` at ${data.time.slice(0, 5)}` : ""}.`,
        link: "/patient",
      });
    }

    // Notify the patient of the new slot.
    const siteUrl = getSiteUrl();
    const notifications = await sendRescheduleNotifications({
      appointmentId: (row.appointment_no as string | null) ?? (row.id as string),
      patientName: row.patient_name ?? "Patient",
      serviceName: services?.name ?? null,
      date: data.date,
      time: (data.time ?? null)?.slice(0, 5) ?? "Flexible",
      statusUrl: siteUrl ? `${siteUrl}/appointment-status` : undefined,
      phone: row.patient_phone ?? undefined,
      email: row.patient_email ?? undefined,
      previousDate: row.date as string,
      previousTime: (row.time as string | null)?.slice(0, 5) ?? undefined,
    });

    return { error: null, notifications };
  });

// ---------------------------------------------------------------------------
// Admin — payment methods (prepaid Video Consultation)
// ---------------------------------------------------------------------------

const paymentMethodInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(500).optional(),
  instructions: z.string().trim().max(2000).optional(),
  account_holder_name: z.string().trim().max(200).nullable().optional(),
  bank_name: z.string().trim().max(200).nullable().optional(),
  account_number: z.string().trim().max(200).nullable().optional(),
  iban: z.string().trim().max(200).nullable().optional(),
  mobile_number: z.string().trim().max(50).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

export const adminGetPaymentMethods = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("payment_methods")
      .select("*")
      .order("sort_order");
    return { methods: data ?? [] };
  });

export const adminCreatePaymentMethod = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(paymentMethodInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("payment_methods").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdatePaymentMethod = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: paymentMethodInputSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("payment_methods")
      .update(data.data)
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeletePaymentMethod = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("payment_methods").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — AI chatbot usage analytics
// ---------------------------------------------------------------------------

export const adminGetChatUsage = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      range: z.enum(["today", "7d", "30d", "all"]).default("30d"),
    }),
  )
  .handler(async ({ data }): Promise<ChatUsageStats> => {
    return getChatUsageStats(data.range as ChatUsageRange);
  });

// ---------------------------------------------------------------------------
// Patient — my appointments (dashboard)
// ---------------------------------------------------------------------------

interface PatientVideoRow {
  vc_no: string | null;
  status: string | null;
  created_at: string | null;
}

export interface PatientAppointment {
  id: string;
  appointmentNo: string | null;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed" | "arrived" | "no_show";
  date: string;
  time: string | null;
  notes: string | null;
  createdAt: string;
  serviceName: string | null;
  isVideo: boolean;
  paymentStatus: string | null;
  paymentAmount: number | null;
  offerTitle: string | null;
  vcNo: string | null;
  videoSessionStatus: "scheduled" | "active" | "completed" | null;
  canCancel: boolean;
  canReschedule: boolean;
}

function mapPatientAppointment(row: {
  id: string;
  appointment_no: string | null;
  status: string;
  date: string;
  time: string | null;
  notes: string | null;
  created_at: string;
  payment_status: string | null;
  payment_amount: number | null;
  services?: unknown;
  video_offers?: unknown;
  video_sessions?: unknown;
}): PatientAppointment {
  const serviceRow = row.services as unknown as { name: string | null } | null;
  const serviceName = serviceRow?.name ?? null;
  const isVideo = serviceName?.toLowerCase().includes("video consultation") ?? false;
  const sessions = (row.video_sessions as PatientVideoRow[] | null | undefined) ?? [];
  const offerRow = row.video_offers as unknown as { title: string | null } | null;
  const latest = [...sessions].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  )[0];
  const mutable = row.status === "pending" || row.status === "confirmed";
  return {
    id: row.id,
    appointmentNo: row.appointment_no ?? null,
    status: row.status as PatientAppointment["status"],
    date: row.date,
    time: (row.time as string | null)?.slice(0, 5) ?? null,
    notes: row.notes,
    createdAt: row.created_at,
    serviceName,
    isVideo,
    paymentStatus: row.payment_status,
    paymentAmount: row.payment_amount,
    offerTitle: offerRow?.title ?? null,
    vcNo: latest?.vc_no ?? null,
    videoSessionStatus: (latest?.status as "scheduled" | "active" | "completed" | null) ?? null,
    canCancel: mutable && row.date >= todayInClinic(),
    canReschedule: mutable && row.date >= todayInClinic(),
  };
}

export const patientGetMyAppointments = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("appointments")
      .select(
        `
        id, appointment_no, status, date, time, notes, created_at,
        payment_status, payment_amount,
        services:service_id (name),
        video_offers:offer_id (title),
        video_sessions:video_sessions (vc_no, status, created_at)
      `,
      )
      .eq("patient_id", context.patientId)
      .order("date", { ascending: false })
      .order("time", { ascending: false });

    if (error) return { error: error.message, appointments: [] };
    const rows = (data ?? []).map(mapPatientAppointment);
    const today = todayInClinic();
    const upcoming = rows.filter((r) => r.date >= today);
    const past = rows.filter((r) => r.date < today);
    return { error: null, appointments: [...upcoming, ...past] };
  });

// ---------------------------------------------------------------------------
// Patient — link a previously booked (guest) appointment to my account
// ---------------------------------------------------------------------------

export const patientClaimAppointment = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(
    z
      .object({
        appointmentId: z.string().trim().min(1).max(64),
        phone: z.string().trim().min(7).max(30).optional(),
        email: z.string().trim().email().max(200).toLowerCase().optional(),
      })
      .refine((v) => v.phone || v.email, { message: "Enter your phone number or email." }),
  )
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const id = data.appointmentId.trim();

    let query = admin.from("appointments").select("id, patient_id");
    if (uuidSchema.safeParse(id).success) {
      query = query.or(`id.eq.${id},appointment_no.eq.${id}`);
    } else {
      query = query.eq("appointment_no", id);
    }
    if (data.email) query = query.eq("patient_email", data.email);
    if (data.phone) query = query.eq("patient_phone", data.phone);

    const { data: row, error } = await query.maybeSingle();
    if (error || !row) {
      return { error: "No matching appointment found. Check the ID and contact details." };
    }
    if (row.patient_id && row.patient_id !== context.patientId) {
      return { error: "That appointment is already linked to another account." };
    }

    const { error: updateError } = await admin
      .from("appointments")
      .update({ patient_id: context.patientId })
      .eq("id", row.id);
    if (updateError) return { error: updateError.message };

    await createPatientNotification(admin, {
      userId: context.patientId,
      type: "appointment_status",
      title: "Appointment linked",
      body: `Appointment ${id} is now linked to your account.`,
      link: "/patient",
    });
    return { error: null };
  });

// ---------------------------------------------------------------------------
// Patient — cancel my appointment
// ---------------------------------------------------------------------------

export const patientCancelAppointment = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();

    const { data: row } = await admin
      .from("appointments")
      .select("id, patient_id, status, date, appointment_no")
      .eq("id", data.id)
      .maybeSingle();

    if (!row) return { error: "Appointment not found." };
    if (row.patient_id !== context.patientId) return { error: "Forbidden" };
    if (row.status !== "pending" && row.status !== "confirmed") {
      return { error: "Only pending or confirmed appointments can be cancelled." };
    }
    if (row.date < todayInClinic()) {
      return { error: "Past appointments cannot be cancelled online. Please contact the clinic." };
    }

    const { error } = await admin
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) return { error: error.message };

    await releaseOfferUsage(admin, data.id);

    await createPatientNotification(admin, {
      userId: context.patientId,
      type: "appointment_cancelled",
      title: "Appointment cancelled",
      body: `Your appointment ${(row.appointment_no as string | null) ?? data.id} has been cancelled.`,
      link: "/patient",
    });

    return { error: null };
  });

// ---------------------------------------------------------------------------
// Patient — reschedule my appointment (same rules as admin reschedule)
// ---------------------------------------------------------------------------

export const patientRescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema, date: dateSchema, time: timeSchema.nullable().optional() }))
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();

    const { data: row } = await admin
      .from("appointments")
      .select(
        "id, patient_id, status, date, time, duration_minutes, services:service_id (name, duration_minutes)",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (!row) return { error: "Appointment not found." };
    if (row.patient_id !== context.patientId) return { error: "Forbidden" };
    if (row.status !== "pending" && row.status !== "confirmed") {
      return { error: "Only pending or confirmed appointments can be rescheduled." };
    }
    if (row.date < todayInClinic()) {
      return {
        error: "Past appointments cannot be rescheduled online. Please contact the clinic.",
      };
    }

    const services = row.services as unknown as {
      name: string | null;
      duration_minutes: number | null;
    } | null;
    const serviceName = services?.name ?? "";
    const isHomeVisit = serviceName.toLowerCase().includes("home visit");
    const isVideo = serviceName.toLowerCase().includes("video consultation");
    const duration = isVideo ? 15 : (services?.duration_minutes ?? row.duration_minutes ?? 30);

    const slotError = await validateAppointmentSlot(admin, {
      date: data.date,
      time: data.time ?? null,
      durationMinutes: duration,
      isHomeVisit,
      excludeId: data.id,
    });
    if (slotError) return { error: slotError };

    const { error } = await admin
      .from("appointments")
      .update({ date: data.date, time: data.time ?? null })
      .eq("id", data.id);
    if (error) {
      const isSlotCollision = error.code === "23505" || error.code === "23P01";
      return {
        error: isSlotCollision
          ? "That slot was just taken. Please pick another time."
          : error.message,
      };
    }

    await createPatientNotification(admin, {
      userId: context.patientId,
      type: "appointment_rescheduled",
      title: "Appointment rescheduled",
      body: `Your appointment was moved to ${data.date}${data.time ? ` at ${data.time.slice(0, 5)}` : ""}.`,
      link: "/patient",
    });

    return { error: null };
  });

// ---------------------------------------------------------------------------
// Patient — in-app notification center
// ---------------------------------------------------------------------------

export const patientGetMyNotifications = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("patient_notifications")
      .select("*")
      .eq("user_id", context.patientId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { error: error?.message ?? null, notifications: data ?? [] };
  });

export const patientMarkNotificationRead = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data, context }) => {
    const { error } = await getSupabaseAdmin()
      .from("patient_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.patientId);
    return { error: error?.message ?? null };
  });

export const patientMarkAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }) => {
    const { error } = await getSupabaseAdmin()
      .from("patient_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.patientId)
      .is("read_at", null);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Patient — my profile
// ---------------------------------------------------------------------------

export const patientUpdateProfile = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(
    z.object({
      full_name: z.string().trim().min(1).max(100).optional(),
      phone: z.string().trim().max(30).optional(),
      date_of_birth: dateSchema.nullable().optional(),
      gender: z.string().trim().max(20).nullable().optional(),
      address: z.string().trim().max(500).nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await getSupabaseAdmin()
      .from("profiles")
      .update(data)
      .eq("id", context.patientId);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Patient — my medical documents
// ---------------------------------------------------------------------------

export const patientGetMyDocuments = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("documents")
      .select("*")
      .eq("patient_id", context.patientId)
      .order("created_at", { ascending: false });
    return { error: error?.message ?? null, documents: data ?? [] };
  });

export const patientDeleteDocument = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from("documents")
      .select("id, patient_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) return { error: "Document not found." };
    if (doc.patient_id !== context.patientId) return { error: "Forbidden" };
    const { error } = await admin.from("documents").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

/**
 * Send a document to the doctor for review. Guarded so an already-sent
 * document cannot be sent a second time (prevents accidental duplicate sends).
 */
export const patientShareDocument = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from("documents")
      .select("id, patient_id, shared_with_doctor, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) return { error: "Document not found." };
    if (doc.patient_id !== context.patientId) return { error: "Forbidden" };
    if (doc.shared_with_doctor === true) {
      return { error: "This document has already been sent to the doctor." };
    }
    const { error } = await admin
      .from("documents")
      .update({
        shared_with_doctor: true,
        shared_at: new Date().toISOString(),
        status: "sent_to_doctor",
      })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

/**
 * Tests / lab investigations the doctor recommended for this patient. These
 * are created from the admin Reports section and appear on the patient's
 * dashboard automatically.
 */
export const patientGetMyTestRecommendations = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("test_recommendations")
      .select("id, test_name, notes, status, created_at")
      .eq("patient_id", context.patientId)
      .order("created_at", { ascending: false });
    return { error: error?.message ?? null, recommendations: data ?? [] };
  });

/**
 * Patient confirms they got the recommended test done. Only the patient who
 * owns the recommendation can update it (ownership verified server-side).
 */
export const patientMarkTestRecommendationCompleted = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const { data: rec } = await admin
      .from("test_recommendations")
      .select("id, patient_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!rec) return { error: "Recommendation not found." };
    if (rec.patient_id !== context.patientId) return { error: "Forbidden" };
    if (rec.status === "completed") return { error: null };
    const { error } = await admin
      .from("test_recommendations")
      .update({ status: "completed" })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Public — reviews (moderated submission)
// ---------------------------------------------------------------------------

export const submitReview = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(
    z.object({
      name: z.string().trim().min(1, "Enter your name").max(100),
      rating: z.number().int().min(1).max(5),
      text: z.string().trim().min(1, "Please write your review").max(4000),
    }),
  )
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();

    // A signed-in patient's review is linked to their account.
    let patientId: string | null = null;
    if (context?.accessToken) {
      const { data: userData } = await admin.auth.getUser(context.accessToken);
      if (userData?.user) patientId = userData.user.id;
    }

    // Moderation: submissions start pending + hidden until an admin approves.
    const { error } = await admin.from("reviews").insert({
      name: data.name,
      rating: data.rating,
      text: data.text,
      patient_id: patientId,
      status: "pending",
      is_active: false,
    });
    if (error) return { error: error.message };

    if (patientId) {
      await createPatientNotification(admin, {
        userId: patientId,
        type: "review",
        title: "Review submitted",
        body: "Thanks! Your review is pending approval and will appear once approved.",
        link: "/patient",
      });
    }
    return { error: null };
  });

// ---------------------------------------------------------------------------
// Public — place a product order
// ---------------------------------------------------------------------------

const orderItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().min(1).max(50),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([optionalAuthMiddleware])
  .validator(
    z.object({
      items: z.array(orderItemSchema).min(1, "Your cart is empty").max(50),
      name: z.string().trim().min(1, "Enter your name").max(100),
      phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
      email: z.string().trim().email().max(200).toLowerCase().optional(),
      address: z.string().trim().min(1, "Enter your delivery address").max(1000),
      notes: z.string().trim().max(1000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();

    let patientId: string | null = null;
    if (context?.accessToken) {
      const { data: userData } = await admin.auth.getUser(context.accessToken);
      if (userData?.user) patientId = userData.user.id;
    }

    // Validate products, snapshot prices, compute the total server-side.
    const ids = data.items.map((i) => i.productId);
    const { data: products, error: productsError } = await admin
      .from("products")
      .select("id, name, price, in_stock")
      .in("id", ids);
    if (productsError) return { error: productsError.message };

    const byId = new Map((products ?? []).map((p) => [p.id, p]));
    let total = 0;
    const itemRows: Array<{
      product_id: string;
      product_name: string;
      price: number;
      quantity: number;
    }> = [];
    for (const item of data.items) {
      const product = byId.get(item.productId);
      if (!product) return { error: "One of the products is no longer available." };
      if (product.in_stock !== true) return { error: `"${product.name}" is out of stock.` };
      const price = Number(product.price ?? 0);
      total += price * item.quantity;
      itemRows.push({
        product_id: item.productId,
        product_name: product.name as string,
        price,
        quantity: item.quantity,
      });
    }

    const orderId = crypto.randomUUID();
    for (let attempt = 0; attempt < ID_RETRY_ATTEMPTS; attempt++) {
      const orderNo = generateOrderNo();
      const { error: orderError } = await admin.from("orders").insert({
        id: orderId,
        order_no: orderNo,
        patient_id: patientId,
        name: data.name,
        phone: data.phone,
        email: data.email ?? null,
        address: data.address,
        total,
        status: "placed",
        notes: data.notes ?? null,
      });
      if (!orderError) {
        const { error: itemsError } = await admin
          .from("order_items")
          .insert(itemRows.map((r) => ({ order_id: orderId, ...r })));
        if (itemsError) {
          await admin.from("orders").delete().eq("id", orderId);
          return { error: itemsError.message };
        }

        if (patientId) {
          await createPatientNotification(admin, {
            userId: patientId,
            type: "appointment_status",
            title: "Order placed",
            body: `Your order ${orderNo} has been placed. We will contact you to confirm delivery.`,
            link: "/patient/orders",
          });
        }
        return { error: null, orderNo };
      }
      const isCodeCollision = orderError.code === "23505" && /order_no/i.test(orderError.message);
      if (!isCodeCollision) return { error: orderError.message, orderNo: null };
    }
    return { error: "Could not generate a unique order number. Please try again.", orderNo: null };
  });

export const patientGetMyOrders = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async ({ context }) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("orders")
      .select(
        "*, order_items:order_items (product_id, product_name, price, quantity), status_history:order_status_history (id, status, note, created_at), requests:order_requests (id, kind, message, status, admin_notes, created_at, resolved_at)",
      )
      .eq("patient_id", context.patientId)
      .order("created_at", { ascending: false });
    return { error: error?.message ?? null, orders: data ?? [] };
  });

/**
 * Order detail for the patient — the order plus its items, status timeline and
 * any requests the patient already raised. Ownership is enforced server-side.
 */
export const patientGetOrderDetail = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select(
        "*, order_items:order_items (product_id, product_name, price, quantity), status_history:order_status_history (id, status, note, created_at), requests:order_requests (id, kind, message, status, admin_notes, created_at, resolved_at)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) return { error: error.message, order: null };
    if (!order) return { error: "Order not found.", order: null };
    if (order.patient_id !== context.patientId) return { error: "Forbidden", order: null };
    return { error: null, order };
  });

/**
 * Patient raises a query, cancellation or return request against one of their
 * orders. Cancellation/return is a REQUEST — the order is never deleted and its
 * current status is respected (no cancel after shipping, no return before
 * delivery).
 */
export const patientSubmitOrderRequest = createServerFn({ method: "POST" })
  .middleware([patientMiddleware])
  .validator(
    z.object({
      orderId: uuidSchema,
      kind: z.enum(["query", "cancel", "return"]),
      message: z
        .string()
        .trim()
        .min(5, "Please describe your request (at least 5 characters)")
        .max(2000),
    }),
  )
  .handler(async ({ data, context }) => {
    const admin = getSupabaseAdmin();
    const { data: order } = await admin
      .from("orders")
      .select("patient_id, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { error: "Order not found." };
    if (order.patient_id !== context.patientId) return { error: "Forbidden" };

    if (data.kind === "cancel") {
      if (order.status !== "placed" && order.status !== "processing") {
        return {
          error:
            "This order can no longer be cancelled online (it is already shipped or delivered). Please contact the clinic.",
        };
      }
    }
    if (data.kind === "return") {
      if (order.status !== "delivered") {
        return { error: "A return can only be requested after the order is delivered." };
      }
    }

    const { error } = await admin.from("order_requests").insert({
      order_id: data.orderId,
      patient_id: context.patientId,
      kind: data.kind,
      message: data.message,
      status: "new",
    });
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Public — FAQs, doctor profile, support
// ---------------------------------------------------------------------------

export const getPublicFaqs = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("faqs")
      .select("id, category, question, answer")
      .eq("is_active", true)
      .order("category")
      .order("sort_order");
    return { faqs: data ?? [] };
  });

export const getPublicDoctorProfile = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("doctor_profile")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return { profile: data ?? null };
  });

export const submitSupportMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1, "Enter your name").max(100),
      email: z.string().trim().email().max(200).toLowerCase().optional(),
      phone: z.string().trim().max(30).optional(),
      subject: z.string().trim().max(200).optional(),
      message: z
        .string()
        .trim()
        .min(10, "Please describe your question (at least 10 characters)")
        .max(4000),
    }),
  )
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("support_messages")
      .insert({
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        subject: data.subject ?? "",
        message: data.message,
        status: "new",
      });
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Public — global search
// ---------------------------------------------------------------------------

export const searchSiteContent = createServerFn({ method: "POST" })
  .validator(z.object({ q: z.string().trim().max(200) }))
  .handler(async ({ data }) => {
    const groups = await searchSite(getSupabaseAdmin(), data.q);
    return { groups };
  });

// ---------------------------------------------------------------------------
// Admin — FAQs
// ---------------------------------------------------------------------------

const faqInputSchema = z.object({
  category: z.string().trim().max(100).optional(),
  question: z.string().trim().min(1, "Question is required").max(500),
  answer: z.string().trim().min(1, "Answer is required").max(4000),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const adminGetFaqs = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("faqs")
      .select("*")
      .order("category")
      .order("sort_order");
    return { faqs: data ?? [] };
  });

export const adminCreateFaq = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(faqInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("faqs").insert(data);
    return { error: error?.message ?? null };
  });

export const adminUpdateFaq = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema, data: faqInputSchema.partial() }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("faqs").update(data.data).eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminDeleteFaq = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from("faqs").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — support inbox
// ---------------------------------------------------------------------------

export const adminGetSupportMessages = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return { messages: data ?? [] };
  });

export const adminUpdateSupportMessage = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      id: uuidSchema,
      status: z.enum(["new", "in_progress", "resolved", "closed"]).optional(),
      admin_notes: z.string().trim().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const updates: { status?: string; admin_notes?: string; resolved_at?: string | null } = {};
    if (data.status) updates.status = data.status;
    if (data.admin_notes !== undefined) updates.admin_notes = data.admin_notes;
    if (data.status === "resolved" || data.status === "closed") {
      updates.resolved_at = new Date().toISOString();
    } else if (data.status) {
      updates.resolved_at = null;
    }
    const { error } = await getSupabaseAdmin()
      .from("support_messages")
      .update(updates)
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — doctor profile
// ---------------------------------------------------------------------------

const doctorProfileInputSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(200).optional(),
  tagline: z.string().trim().max(500).optional(),
  bio: z.string().trim().max(8000).optional(),
  credentials: z.string().trim().max(2000).optional(),
  education: z.string().trim().max(2000).optional(),
  experience_years: z.number().int().min(0).max(100).optional(),
  languages: z.string().trim().max(300).optional(),
  specialties: z.string().trim().max(500).optional(),
  photo_url: z.string().trim().max(1000).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  social_links: z.record(z.string()).optional(),
  is_active: z.boolean().optional(),
});

export const adminGetDoctorProfile = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const { data } = await getSupabaseAdmin()
      .from("doctor_profile")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return { profile: data ?? null };
  });

export const adminUpdateDoctorProfile = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(doctorProfileInputSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("doctor_profile")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    return { error: error?.message ?? null };
  });

// ---------------------------------------------------------------------------
// Admin — medical documents (all patients)
// ---------------------------------------------------------------------------

export const adminGetDocuments = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const admin = getSupabaseAdmin();

    // The `documents.patient_id` column has NO foreign key to `profiles`, so
    // PostgREST cannot embed a join (`profiles:patient_id (full_name)`) — that
    // query fails with PGRST200 ("Could not find a relationship ...") and the
    // error was silently collapsed into `documents: []`, leaving the admin
    // documents page permanently empty. Fetch the documents first, then resolve
    // patient names with a separate, explicit query.
    const { data, error } = await admin
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { error: error.message, documents: [] };

    const rows = data ?? [];
    const patientIds = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean)));
    const patientById = new Map<string, { full_name: string | null; phone: string | null }>();
    if (patientIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", patientIds);
      if (profilesError) return { error: profilesError.message, documents: [] };
      for (const p of profiles ?? [])
        patientById.set(p.id, { full_name: p.full_name, phone: p.phone });
    }

    const documents = rows.map((r) => ({
      ...r,
      profiles: patientById.has(r.patient_id)
        ? (patientById.get(r.patient_id) ?? { full_name: null, phone: null })
        : null,
    }));
    return { error: null, documents };
  });

/** Mark a shared document as received after the doctor opens/downloads it. */
export const adminMarkDocumentReceived = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: doc } = await admin
      .from("documents")
      .select("id, shared_with_doctor")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) return { error: "Document not found." };
    if (doc.shared_with_doctor !== true)
      return { error: "This document was not shared with the doctor." };
    const { error } = await admin
      .from("documents")
      .update({ status: "received" })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

/**
 * Recommend a test / lab investigation for a patient. The recommendation is
 * saved to `test_recommendations` and the patient is notified, so it shows up
 * automatically on their dashboard.
 */
export const adminCreateTestRecommendation = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      patientId: uuidSchema,
      testName: z.string().trim().min(1, "Enter the test name").max(200),
      notes: z.string().trim().max(1000).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.patientId)
      .maybeSingle();
    if (!profile) return { error: "Patient not found." };

    const { error } = await admin.from("test_recommendations").insert({
      patient_id: data.patientId,
      test_name: data.testName,
      notes: data.notes,
      status: "pending",
    });
    if (error) return { error: error.message };

    await createPatientNotification(admin, {
      userId: data.patientId,
      type: "general",
      title: "New test recommendation",
      body: `Dr. Naseem recommended: ${data.testName}`,
      link: "/patient",
    });

    return { error: null };
  });

/**
 * All test recommendations for the Reports section, with the patient's name
 * and phone so the doctor can see who the test is for and whether the patient
 * has confirmed it is done.
 */
export const adminGetTestRecommendations = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("test_recommendations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { error: error.message, recommendations: [] };

    const rows = data ?? [];
    const patientIds = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean)));
    const patientById = new Map<string, { full_name: string | null; phone: string | null }>();
    if (patientIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", patientIds);
      if (profilesError) return { error: profilesError.message, recommendations: [] };
      for (const p of profiles ?? [])
        patientById.set(p.id, { full_name: p.full_name, phone: p.phone });
    }

    const recommendations = rows.map((r) => ({
      ...r,
      profiles: patientById.has(r.patient_id)
        ? (patientById.get(r.patient_id) ?? { full_name: null, phone: null })
        : null,
    }));
    return { error: null, recommendations };
  });

// ---------------------------------------------------------------------------
// Admin — orders
// ---------------------------------------------------------------------------

export const adminGetOrders = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("orders")
      .select("*, order_items:order_items (product_name, price, quantity)")
      .order("created_at", { ascending: false })
      .limit(500);
    return { error: error?.message ?? null, orders: data ?? [] };
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      id: uuidSchema,
      status: z.enum(["placed", "processing", "shipped", "delivered", "cancelled"]),
      note: z.string().trim().max(1000).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: order } = await admin
      .from("orders")
      .select("id, patient_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!order) return { error: "Order not found." };
    if (order.status === data.status) {
      return { error: `Order is already ${data.status}.` };
    }

    const { error } = await admin.from("orders").update({ status: data.status }).eq("id", data.id);
    if (error) return { error: error.message };

    // Immutable timeline entry for the patient's "My Orders" detail view.
    await admin.from("order_status_history").insert({
      order_id: data.id,
      status: data.status,
      note: data.note || null,
    });

    // Notify the patient (best-effort; the notification helper never throws).
    if (order.patient_id) {
      const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      await createPatientNotification(admin, {
        userId: order.patient_id,
        type: "order",
        title: `Order ${data.status}`,
        body: `Your order status changed to ${statusLabel}.`,
        link: "/patient/orders",
      });
    }
    return { error: null };
  });

/** Admin/doctor — list patient order requests (queries, cancels, returns). */
export const adminGetOrderRequests = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const admin = getSupabaseAdmin();

    // Same embedded-join problem as `adminGetDocuments`: `order_requests` has
    // no FK to `profiles`, and the orders join referenced a non-existent
    // `total_amount` column. Both errors were silently collapsed into an empty
    // list. Fetch the base rows, then resolve the related order and patient in
    // separate explicit queries.
    const { data, error } = await admin
      .from("order_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { error: error.message, requests: [] };
    const rows = data ?? [];

    const patientIds = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean)));
    const patientsById = new Map<string, { full_name: string | null; phone: string | null }>();
    if (patientIds.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", patientIds);
      if (profilesError) return { error: profilesError.message, requests: [] };
      for (const p of profiles ?? [])
        patientsById.set(p.id, { full_name: p.full_name, phone: p.phone });
    }

    const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean)));
    const ordersById = new Map<
      string,
      { order_no: string | null; status: string; total: number; created_at: string }
    >();
    if (orderIds.length > 0) {
      const { data: orders, error: ordersError } = await admin
        .from("orders")
        .select("id, order_no, status, total, created_at")
        .in("id", orderIds);
      if (ordersError) return { error: ordersError.message, requests: [] };
      for (const o of orders ?? [])
        ordersById.set(o.id, {
          order_no: o.order_no,
          status: o.status,
          total: o.total,
          created_at: o.created_at,
        });
    }

    const requests = rows.map((r) => ({
      ...r,
      order: ordersById.get(r.order_id) ?? null,
      patient: patientsById.get(r.patient_id) ?? null,
    }));
    return { error: null, requests };
  });

/** Admin/doctor — respond to a patient order request. */
export const adminUpdateOrderRequest = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      id: uuidSchema,
      status: z.enum(["new", "in_progress", "resolved", "closed"]),
      adminNotes: z.string().trim().max(1000).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin();
    const { data: req } = await admin
      .from("order_requests")
      .select("id, patient_id, kind")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) return { error: "Request not found." };

    const { error } = await admin
      .from("order_requests")
      .update({
        status: data.status,
        admin_notes: data.adminNotes || null,
        resolved_at:
          data.status === "resolved" || data.status === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) return { error: error.message };

    if (req.patient_id) {
      const kindLabel =
        req.kind === "query" ? "Query" : req.kind === "cancel" ? "Cancellation" : "Return";
      await createPatientNotification(admin, {
        userId: req.patient_id,
        type: "order",
        title: `${kindLabel} request ${data.status}`,
        body: data.adminNotes || `Your ${kindLabel.toLowerCase()} request is now ${data.status}.`,
        link: "/patient/orders",
      });
    }
    return { error: null };
  });

// ---------------------------------------------------------------------------
// Admin — appointment reminders
// ---------------------------------------------------------------------------

export const adminGetReminders = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("reminders")
      .select(
        "*, appointments:appointment_id (appointment_no, patient_name, date, time, services:service_id (name))",
      )
      .order("remind_at", { ascending: false })
      .limit(200);
    return { error: error?.message ?? null, reminders: data ?? [] };
  });

export const adminCreateReminder = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      appointmentId: uuidSchema,
      channel: z.enum(["email", "sms", "whatsapp"]),
      remindOn: dateSchema,
      remindAt: timeSchema,
    }),
  )
  .handler(async ({ data }) => {
    const result = await createAppointmentReminder(getSupabaseAdmin(), {
      appointmentId: data.appointmentId,
      channel: data.channel,
      remindOn: data.remindOn,
      remindAt: data.remindAt,
    });
    return { error: result.error };
  });

export const adminCancelReminder = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(z.object({ id: uuidSchema }))
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from("reminders")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const adminSendDueReminders = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    const result = await sendDueReminders(getSupabaseAdmin());
    return result;
  });

// ---------------------------------------------------------------------------
// Admin — analytics dashboard
// ---------------------------------------------------------------------------

export const adminGetAnalytics = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((d: unknown) => d as undefined)
  .handler(async () => {
    return getAnalytics(getSupabaseAdmin());
  });
