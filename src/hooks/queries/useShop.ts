import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  submitOrderPayment,
  submitOrderPaymentAsGuest,
  submitOrderReceiptAsGuest,
  verifyOrderPayment,
  setOrderPaymentStatus,
  reorderOrder,
  submitProductReview,
  getProductReviewsAdmin,
  updateProductReviewAdmin,
  type GuestOrderPaymentInput,
  type GuestOrderReceiptInput,
  type OrderPaymentVerification,
  type AdminProductReview,
} from "@/lib/shop";
import { getProductById, getPublishedProductReviews, type Product } from "@/lib/admin-data";
import { getActivePaymentMethods } from "@/lib/payment";

// --- Payment methods (shared with the video flow) ---

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["payment-methods"],
    queryFn: getActivePaymentMethods,
    staleTime: 1000 * 60 * 30,
  });
}

// --- Order payments ---

export function useSubmitOrderPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitOrderPayment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "orders"] }),
  });
}

export function useSubmitGuestOrderPayment() {
  return useMutation({
    mutationFn: (input: GuestOrderPaymentInput) => submitOrderPaymentAsGuest(input),
  });
}

export function useSubmitGuestOrderReceipt() {
  return useMutation({
    mutationFn: (input: GuestOrderReceiptInput) => submitOrderReceiptAsGuest(input),
  });
}

export function useVerifyOrderPayment() {
  return useMutation({
    mutationFn: (input: {
      id: string;
      phone?: string;
      email?: string;
    }): Promise<{ error: string | null; result: OrderPaymentVerification | null }> =>
      verifyOrderPayment(input),
  });
}

// --- Admin order payments ---

export function useSetOrderPaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      status,
    }: {
      orderId: string;
      status: "payment_verified" | "payment_failed" | "refunded" | "waived";
    }) => setOrderPaymentStatus(orderId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "orderRequests"] });
    },
  });
}

// --- Buy Again ---

export function useReorderOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => reorderOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", "orders"] });
    },
  });
}

// --- Product reviews (public) ---

export function useProductDetail(productId: string | null) {
  return useQuery<Product | null>({
    queryKey: ["product", productId],
    queryFn: () => getProductById(productId!),
    enabled: !!productId,
  });
}

export function useProductReviews(productId: string | null) {
  return useQuery<
    Array<{ id: string; name: string; rating: number; comment: string; created_at: string }>
  >({
    queryKey: ["product-reviews", productId],
    queryFn: () => getPublishedProductReviews(productId!),
    enabled: !!productId,
  });
}

export function useSubmitProductReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitProductReview,
  });
}

// --- Admin product review moderation ---

export function useAdminProductReviews() {
  return useQuery<AdminProductReview[]>({
    queryKey: ["admin", "product-reviews"],
    queryFn: async () => {
      const result = await getProductReviewsAdmin();
      return result.reviews;
    },
  });
}

export function useUpdateProductReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      isActive,
    }: {
      id: string;
      status: "pending" | "approved" | "rejected";
      isActive?: boolean;
    }) => updateProductReviewAdmin(id, { status, isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "product-reviews"] });
      qc.invalidateQueries({ queryKey: ["product-reviews"] });
      qc.invalidateQueries({ queryKey: ["product"] });
    },
  });
}
