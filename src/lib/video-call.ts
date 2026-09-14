import { supabase } from "@/lib/supabase";
import {
  adminCreateVideoSession,
  adminGetLiveKitUsage,
  adminUpdateVideoSessionStatus,
  getVideoJoinByVcNo as getVideoJoinByVcNoServer,
  getVideoJoinToken as getVideoJoinTokenServer,
  reportVideoSessionEvent as reportVideoSessionEventServer,
} from "@/lib/actions.functions";
import type { NotificationResult } from "@/lib/notifications";
import type { LiveKitUsageSnapshot } from "@/lib/server/livekit-usage";

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
  /** Whether LiveKit is configured on the server (a warning, never a blocker). */
  livekitConfigured: boolean;
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
  /** LiveKit websocket URL — empty until LiveKit is configured on the server. */
  serverUrl: string;
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
  /** Whether LiveKit is configured on the server (helps surface a precise message). */
  livekitConfigured: boolean;
}

/** Public join lookup by the patient-facing VC code. Never needs the internal UUID. */
export async function getVideoJoinByVcNo(vcNo: string): Promise<VideoJoinResult> {
  return getVideoJoinByVcNoServer({ data: { vcNo } });
}

export interface VideoJoinTokenResult {
  error: string | null;
  token: string | null;
  serverUrl: string;
  roomName: string;
  expiresAt: number | null;
}

/**
 * Mint the server-signed LiveKit JWT for this participant. The API secret stays
 * on the server — the browser only ever receives this short-lived token.
 */
export async function getVideoJoinToken(vcNo: string): Promise<VideoJoinTokenResult> {
  return getVideoJoinTokenServer({ data: { vcNo } });
}

/** Best-effort join/leave event for the admin usage estimate. */
export async function reportVideoSessionEventClient(args: {
  vcNo: string;
  role: "patient" | "doctor";
  event: "joined" | "left";
}): Promise<void> {
  try {
    await reportVideoSessionEventServer({ data: args });
  } catch {
    // Usage accounting must never affect the consultation.
  }
}

/** Admin dashboard "LiveKit Usage" snapshot. */
export async function getLiveKitUsage(): Promise<LiveKitUsageSnapshot> {
  return adminGetLiveKitUsage({ data: undefined });
}
