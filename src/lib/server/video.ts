import { supabase } from "@/lib/supabase";

export interface VideoSession {
  id: string;
  appointment_id: string;
  room_name: string;
  status: "scheduled" | "active" | "completed";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export async function createVideoSession(appointmentId: string): Promise<{
  error: string | null;
  session: VideoSession | null;
}> {
  const roomName = `naseem-${appointmentId.replace(/-/g, "").slice(0, 12)}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from("video_sessions")
    .insert({
      appointment_id: appointmentId,
      room_name: roomName,
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error) return { error: error.message, session: null };
  return { error: null, session: data };
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
  const updates: Partial<VideoSession> = { status };
  if (status === "active") updates.started_at = new Date().toISOString();
  if (status === "completed") updates.ended_at = new Date().toISOString();

  const { error } = await supabase.from("video_sessions").update(updates).eq("id", sessionId);
  return { error: error?.message ?? null };
}
