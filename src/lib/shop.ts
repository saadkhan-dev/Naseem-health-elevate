import {
  submitOrderPayment as submitOrderPaymentServer,
  submitGuestOrderPayment,
  submitGuestOrderReceipt,
  verifyGuestOrderPayment,
  adminSetOrderPaymentStatus,
  patientReorder as patientReorderServer,
  patientSubmitProductReview,
  adminGetProductReviews,
  adminUpdateProductReview,
} from "@/lib/actions.functions";

/**
 * Client-side data layer for the e-commerce flow (cart checkout, order
 * payments, reorder, product reviews). Mirrors the video-consultation payment
 * helpers in `payment.ts`.
 */

export interface OrderPaymentResult {
  error: string | null;
}

export interface GuestOrderPaymentInput {
  id: string;
  phone?: string;
  email?: string;
  methodId: string;
  reference: string;
  payerName: string;
}

export interface GuestOrderReceiptInput {
  id: string;
  phone?: string;
  email?: string;
  methodId?: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/jpg" | "image/png";
  fileBase64: string;
  fileSize: number;
}

export interface OrderPaymentVerification {
  orderNo: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentAmount: number | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  receiptUploaded: boolean;
}

/** Signed-in patient submits payment proof for their own order. */
export async function submitOrderPayment(input: {
  orderId: string;
  methodId: string;
  reference: string;
  payerName: string;
  payerPhone?: string;
  payerEmail?: string;
}): Promise<OrderPaymentResult> {
  return submitOrderPaymentServer({
    data: {
      ...input,
      payerPhone: input.payerPhone?.trim() || undefined,
      payerEmail: input.payerEmail?.trim()?.toLowerCase() || undefined,
    },
  });
}

/** Guest (no account) submits payment proof using Order ID + contact details. */
export async function submitOrderPaymentAsGuest(
  input: GuestOrderPaymentInput,
): Promise<OrderPaymentResult> {
  return submitGuestOrderPayment({
    data: {
      ...input,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim()?.toLowerCase() || undefined,
    },
  });
}

/** Guest uploads a payment receipt screenshot as proof. */
export async function submitOrderReceiptAsGuest(
  input: GuestOrderReceiptInput,
): Promise<OrderPaymentResult> {
  return submitGuestOrderReceipt({
    data: {
      ...input,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim()?.toLowerCase() || undefined,
    },
  });
}

/** Look up an order's payment status with Order ID + contact details. */
export async function verifyOrderPayment(input: {
  id: string;
  phone?: string;
  email?: string;
}): Promise<{ error: string | null; result: OrderPaymentVerification | null }> {
  return verifyGuestOrderPayment({
    data: {
      id: input.id,
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim()?.toLowerCase() || undefined,
    },
  }) as Promise<{ error: string | null; result: OrderPaymentVerification | null }>;
}

/** Admin verifies/rejects/refunds/waives an order payment. */
export async function setOrderPaymentStatus(
  orderId: string,
  status: "payment_verified" | "payment_failed" | "refunded" | "waived",
): Promise<{ error: string | null }> {
  return adminSetOrderPaymentStatus({ data: { orderId, status } });
}

/** Patient reorders a delivered order as a brand new order. */
export async function reorderOrder(
  orderId: string,
): Promise<{ error: string | null; orderNo: string | null }> {
  return patientReorderServer({ data: { orderId } });
}

/** Patient submits a product review (lands in the moderation queue). */
export async function submitProductReview(input: {
  productId: string;
  rating: number;
  comment: string;
}): Promise<{ error: string | null }> {
  return patientSubmitProductReview({ data: input });
}

export interface AdminProductReview {
  id: string;
  product_id: string;
  patient_id: string | null;
  name: string;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected";
  is_active: boolean;
  created_at: string;
  products?: { id: string; name: string } | null;
  profiles?: { full_name: string | null; phone: string | null } | null;
}

export async function getProductReviewsAdmin(): Promise<{
  error: string | null;
  reviews: AdminProductReview[];
}> {
  const result = await adminGetProductReviews({ data: undefined });
  return {
    error: result.error,
    reviews: (result.reviews ?? []) as AdminProductReview[],
  };
}

export async function updateProductReviewAdmin(
  id: string,
  data: { status: "pending" | "approved" | "rejected"; isActive?: boolean },
): Promise<{ error: string | null }> {
  return adminUpdateProductReview({ data: { id, ...data } });
}
