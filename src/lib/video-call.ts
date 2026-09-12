import { supabase } from "@/lib/supabase";
import {
  adminCreateVideoSession,
  adminUpdateVideoSessionStatus,
  getVideoJoinByVcNo as getVideoJoinByVcNoServer,
} from "@/lib/actions.functions";
import type { NotificationResult } from "@/lib/notifications";

export interface VideoSession {
  id: string;
  appointment_id: string;
  room_name: string;
  vc_no: string | null;
  status: "scheduled" | "active" | "completed";
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  created_at: string;
  meet_url: string | null;
  meet_space_id: string | null;
}

export interface VideoCreateResult {
  error: string | null;
  session: VideoSession | null;
  /** True when a NEW session was created; false when the existing one was reused. */
  created: boolean;
  /** Set when the session exists but its Google Meet meeting could not be created. */
  meetError: string | null;
  /** Whether the Google Meet server credentials are configured. */
  meetConfigured: boolean;
  notifications: NotificationResult[];
}

export async function createVideoSession(
  appointmentId: string,
  durationMinutes: number = 30,
): Promise<VideoCreateResult> {
  return adminCreateVideoSession({ data: { appointmentId, durationMinutes } });
}

export async function getVideoSessionByAppointment(
  appointmentId: string,
): Promise<VideoSession | null> {
  const { data } = await supabase
    .from("video_sessions")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function updateVideoSessionStatus(
  sessionId: string,
  status: "scheduled" | "active" | "completed",
) {
  return adminUpdateVideoSessionStatus({ data: { sessionId, status } });
}

export interface VideoJoinSession {
  vcNo: string;
  roomName: string;
  durationMinutes: number;
  status: "scheduled" | "active" | "completed";
  /** Google Meet join URL — the ONLY thing the join button opens. Null when not created yet. */
  meetUrl: string | null;
}

export interface VideoJoinAppointment {
  /** The appointment's internal id — used to open the same consultation chat. */
  appointmentId: string;
  status: string;
  serviceName: string | null;
  date: string;
  time: string | null;
  appointmentNo: string | null;
}

export interface VideoJoinResult {
  error: string | null;
  session: VideoJoinSession | null;
  appointment: VideoJoinAppointment | null;
  /** Internal session id — returned ONLY to a doctor/admin caller (needed to update the call status). */
  sessionId: string | null;
  /** Whether the Google Meet server credentials are configured (helps surface a precise error). */
  meetConfigured: boolean;
}

/** Public join lookup by the patient-facing VC code. Never needs the internal UUID. */
export async function getVideoJoinByVcNo(vcNo: string): Promise<VideoJoinResult> {
  return getVideoJoinByVcNoServer({ data: { vcNo } });
}
