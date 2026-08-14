import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFaqs,
  getDoctorProfile,
  sendSupportMessage,
  sendReview,
  submitOrder,
  searchSiteContentPublic,
  type Faq,
  type DoctorProfile,
  type SearchGroup,
} from "@/lib/site-extra";

export function useFaqs() {
  return useQuery<Faq[]>({
    queryKey: ["faqs", "public"],
    queryFn: getFaqs,
    staleTime: 1000 * 60 * 10,
  });
}

export function useDoctorProfile() {
  return useQuery<DoctorProfile | null>({
    queryKey: ["doctor-profile", "public"],
    queryFn: getDoctorProfile,
    staleTime: 1000 * 60 * 10,
  });
}

export function useSubmitSupportMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendSupportMessage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support", "admin"] }),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendReview,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}

export function usePlaceOrder() {
  return useMutation({ mutationFn: submitOrder });
}

export function useSearch(q: string) {
  return useQuery<SearchGroup[]>({
    queryKey: ["search", q],
    queryFn: () => searchSiteContentPublic(q),
    enabled: q.trim().length >= 2,
    staleTime: 1000 * 60,
  });
}
