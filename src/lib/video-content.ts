import { supabase } from "@/lib/supabase";
import { adminCreateVideo, adminUpdateVideo, adminDeleteVideo } from "@/lib/actions.functions";

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
  is_published?: boolean;
}) {
  return adminCreateVideo({ data });
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
  return adminUpdateVideo({ data: { id, data } });
}

export async function deleteVideo(id: string) {
  return adminDeleteVideo({ data: { id } });
}
