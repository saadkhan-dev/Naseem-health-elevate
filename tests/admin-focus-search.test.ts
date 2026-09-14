import { describe, expect, it } from "bun:test";
import { buildAdminFocusLink, parseFocusTarget, splitNavigationLink } from "../src/lib/admin-focus";
import { appointmentMatchesQuery } from "../src/lib/appointments-search";
import type { AppointmentWithDetails } from "../src/lib/admin-data";

const APPT_ID = "a0000000-0000-4000-8000-000000000001";
const PATIENT_ID = "b1111111-1111-4111-8111-111111111111";

const appointment = (extra: Partial<AppointmentWithDetails> = {}): AppointmentWithDetails => ({
  id: APPT_ID,
  appointment_no: "APT-7K4M92",
  patient_id: PATIENT_ID,
  service_id: "s1",
  date: "2026-09-20",
  time: "19:00",
  status: "pending",
  notes: null,
  created_at: "2026-09-14T12:00:00Z",
  patient_name: "Saad Khan",
  patient_phone: "0300 1234567",
  patient_email: "saad@example.com",
  service_name: "Video Consultation",
  is_video: true,
  duration_minutes: 20,
  payment_status: "payment_pending",
  payment_method: null,
  payment_reference: null,
  payment_payer_name: null,
  payment_submitted_at: null,
  payment_verified_at: null,
  payment_amount: null,
  payment_receipt_url: null,
  offer_title: null,
  video_session_status: null,
  reschedule_status: "none",
  reschedule_requested_by: null,
  reschedule_date: null,
  reschedule_time: null,
  reschedule_requested_at: null,
  last_rescheduled_at: null,
  ...extra,
});

describe("buildAdminFocusLink / parseFocusTarget", () => {
  it("round-trips a focus target", () => {
    const link = buildAdminFocusLink("/admin/appointments", "appointment", APPT_ID);
    expect(link).toBe(`/admin/appointments?focus=appointment&id=${APPT_ID}`);
    expect(parseFocusTarget(splitNavigationLink(link).search as Record<string, unknown>)).toEqual({
      focus: "appointment",
      id: APPT_ID,
    });
  });

  it("is case-insensitive on the focus kind for parsing", () => {
    const link = buildAdminFocusLink("/admin", "patient", PATIENT_ID).replace(
      "focus=patient",
      "focus=Patient",
    );
    const parsed = parseFocusTarget(splitNavigationLink(link).search as Record<string, unknown>);
    expect(parsed?.focus).toBe("patient");
  });

  it("rejects unknown focus kinds and missing ids", () => {
    expect(parseFocusTarget({ focus: "appointment", id: "" })).toBeNull();
    expect(parseFocusTarget({ focus: "widget", id: APPT_ID })).toBeNull();
    expect(parseFocusTarget({ focus: "appointment" })).toBeNull();
  });

  it("splitNavigationLink separates path and query", () => {
    const { path, search } = splitNavigationLink("/admin/orders?focus=order&id=abc");
    expect(path).toBe("/admin/orders");
    expect(search).toEqual({ focus: "order", id: "abc" });
    expect(splitNavigationLink("/admin/appointments").search).toBeUndefined();
  });
});

describe("appointmentMatchesQuery", () => {
  const a = appointment();

  it("matches partial first name case-insensitively", () => {
    expect(appointmentMatchesQuery(a, "saad")).toBe(true);
    expect(appointmentMatchesQuery(a, "SAAD")).toBe(true);
    expect(appointmentMatchesQuery(a, "saa")).toBe(true);
  });

  it("matches partial last name", () => {
    expect(appointmentMatchesQuery(a, "khan")).toBe(true);
  });

  it("matches full name + extra whitespace", () => {
    expect(appointmentMatchesQuery(a, "  saad   khan  ")).toBe(true);
  });

  it("matches phone, ignoring formatting", () => {
    expect(appointmentMatchesQuery(a, "0300")).toBe(true);
    expect(appointmentMatchesQuery(a, "03001234567")).toBe(true);
    expect(appointmentMatchesQuery(a, "123")).toBe(true);
  });

  it("matches appointment_no and ids", () => {
    expect(appointmentMatchesQuery(a, "APT-7K4M92")).toBe(true);
    expect(appointmentMatchesQuery(a, "7K4M92")).toBe(true);
    expect(appointmentMatchesQuery(a, APPT_ID)).toBe(true);
    expect(appointmentMatchesQuery(a, PATIENT_ID)).toBe(true);
  });

  it("requires every whitespace token to match", () => {
    expect(appointmentMatchesQuery(a, "saad khan video")).toBe(true);
    expect(appointmentMatchesQuery(a, "saad khan homevisit")).toBe(false);
  });

  it("returns true for an empty query", () => {
    expect(appointmentMatchesQuery(a, "   ")).toBe(true);
  });

  it("matches service + date + time fields", () => {
    expect(appointmentMatchesQuery(a, "consultation")).toBe(true);
    expect(appointmentMatchesQuery(a, "2026-09-20")).toBe(true);
    expect(appointmentMatchesQuery(a, "19:00")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(appointmentMatchesQuery(a, "zanzibar")).toBe(false);
  });
});
