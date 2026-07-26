import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProducts, type Product } from "@/lib/admin-data";
import {
  getVideos,
  getPublishedVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  type Video,
} from "@/lib/video-content";

// Products (public)
export function usePublishedProducts() {
  return useQuery<Product[]>({
    queryKey: ["products", "published"],
    queryFn: getProducts,
    staleTime: 1000 * 60 * 10,
  });
}

// Videos (public)
export function usePublishedVideos() {
  return useQuery<Video[]>({
    queryKey: ["videos", "published"],
    queryFn: getPublishedVideos,
    staleTime: 1000 * 60 * 10,
  });
}

// Admin: videos
export function useAdminVideos() {
  return useQuery<Video[]>({
    queryKey: ["admin", "videos"],
    queryFn: getVideos,
  });
}

export function useCreateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createVideo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "videos"] }),
  });
}

export function useUpdateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateVideo>[1] }) =>
      updateVideo(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "videos"] }),
  });
}

export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "videos"] }),
  });
}
