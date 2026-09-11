import { supabase } from "@/lib/supabase";

export interface Video {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  duration: string | null;
  is_published: boolean;
  created_at: string;
}

export async function getVideos(): Promise<Video[]> {
  const { data } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getPublishedVideos(): Promise<Video[]> {
  const { data } = await supabase
    .from("videos")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createVideo(data: {
  title: string;
  description?: string;
  thumbnail_url?: string;
  video_url?: string;
  duration?: string;
}) {
  const { error } = await supabase.from("videos").insert(data);
  return { error: error?.message ?? null };
}

export async function updateVideo(
  id: string,
  data: {
    title?: string;
    description?: string;
    thumbnail_url?: string;
    video_url?: string;
    duration?: string;
    is_published?: boolean;
  },
) {
  const { error } = await supabase.from("videos").update(data).eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteVideo(id: string) {
  const { error } = await supabase.from("videos").delete().eq("id", id);
  return { error: error?.message ?? null };
}
