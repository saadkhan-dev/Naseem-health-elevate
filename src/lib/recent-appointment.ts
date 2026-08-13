/**
 * Client-side "My Recent Appointment" convenience store.
 *
 * After a successful guest booking we save a small reference to the patient's
 * own appointment on their device (localStorage) so they can bring the
 * Appointment ID back without retyping it — even after pressing Back or closing
 * the confirmation. This is a convenience ONLY: real lookups always go through
 * the server-side verification (appointment-status / "Find My Appointment"),
 * so patients are never blocked if browser data is cleared or they switch
 * devices.
 */

const KEY = "he:recent-appointment";
/** How long the recent-appointment hint stays relevant (30 days). */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export interface RecentAppointment {
  appointmentNo: string;
  patientName: string;
  serviceName: string;
  /** "yyyy-MM-dd" */
  date: string;
  /** "HH:mm" — null for flexible services (e.g. Home Visit). */
  time: string | null;
  /** ISO timestamp when the appointment was booked. */
  savedAt: string;
}

export function saveRecentAppointment(appointment: RecentAppointment): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(appointment));
  } catch {
    // localStorage can be unavailable (privacy mode / storage full) — the
    // server-side recovery flow covers the patient regardless.
  }
}

export function getRecentAppointment(): RecentAppointment | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecentAppointment;
    if (!parsed?.appointmentNo) return null;
    const savedAt = new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRecentAppointment(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
