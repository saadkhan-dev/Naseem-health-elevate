import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicVideoOffers } from "@/lib/video-offers-public";
import type { VideoOffer } from "@/lib/video-offer-types";
import { getPublishedProducts, type Product } from "@/lib/admin-data";
import {
  getVideos,
  getPublishedVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  type Video,
} from "@/lib/video-content";
import {
  getConditions,
  getReviews,
  getAllConditions,
  createCondition,
  updateCondition,
  deleteCondition,
  getAllReviews,
  createReview,
  updateReview,
  deleteReview,
  type Condition,
  type ConditionCategory,
  type Review,
} from "@/lib/site-content";

// Products (public)
export function usePublishedProducts() {
  return useQuery<Product[]>({
    queryKey: ["products", "published"],
    queryFn: getPublishedProducts,
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

// Video Consultation offers (public — active + upcoming, DISPLAY rule)
export function usePublicVideoOffers() {
  return useQuery<VideoOffer[]>({
    queryKey: ["video-offers", "public"],
    queryFn: getPublicVideoOffers,
    staleTime: 1000 * 60 * 2,
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

// Conditions (public)
export function useConditions(category: ConditionCategory) {
  return useQuery<Condition[]>({
    queryKey: ["conditions", category],
    queryFn: () => getConditions(category),
    staleTime: 1000 * 60 * 10,
  });
}

// Reviews (public)
export function useReviews() {
  return useQuery<Review[]>({
    queryKey: ["reviews"],
    queryFn: getReviews,
    staleTime: 1000 * 60 * 10,
  });
}

// Admin: conditions
export function useAdminConditions() {
  return useQuery<Condition[]>({
    queryKey: ["admin", "conditions"],
    queryFn: getAllConditions,
  });
}

export function useCreateCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCondition,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "conditions"] }),
  });
}

export function useUpdateCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCondition>[1] }) =>
      updateCondition(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "conditions"] }),
  });
}

export function useDeleteCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCondition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "conditions"] }),
  });
}

// Admin: reviews
export function useAdminReviews() {
  return useQuery<Review[]>({
    queryKey: ["admin", "reviews"],
    queryFn: getAllReviews,
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createReview,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reviews"] }),
  });
}

export function useUpdateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateReview>[1] }) =>
      updateReview(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reviews"] }),
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReview(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "reviews"] }),
  });
}
