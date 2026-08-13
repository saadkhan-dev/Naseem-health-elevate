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
}

export interface VideoCreateResult {
  error: string | null;
  session: VideoSession | null;
  /** True when a NEW session was created; false when the existing one was reused. */
  created: boolean;
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
}

export interface VideoJoinAppointment {
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
}

/** Public join lookup by the patient-facing VC code. Never needs the internal UUID. */
export async function getVideoJoinByVcNo(vcNo: string): Promise<VideoJoinResult> {
  return getVideoJoinByVcNoServer({ data: { vcNo } });
}

export function getJitsiUrl(roomName: string, userName: string): string {
  return `https://meet.jit.si/${encodeURIComponent(roomName)}#config.subject=${encodeURIComponent("Dr. Naseem Ahmed Khan - Video Consultation")}&userInfo.displayName=${encodeURIComponent(userName)}`;
}
