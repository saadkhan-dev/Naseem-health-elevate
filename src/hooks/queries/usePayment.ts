import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getActivePaymentMethods,
  submitVideoPayment,
  verifyVideoPayment,
  submitPaymentReceipt,
  type SubmitVideoPaymentInput,
  type VerifyVideoPaymentInput,
  type SubmitPaymentReceiptInput,
  type VideoPaymentVerification,
  type PaymentMethod,
} from "@/lib/payment";

export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: ["payment-methods"],
    queryFn: getActivePaymentMethods,
    staleTime: 1000 * 60 * 30,
  });
}

export function useSubmitVideoPayment() {
  return useMutation({
    mutationFn: (input: SubmitVideoPaymentInput) => submitVideoPayment(input),
  });
}

export function useVerifyVideoPayment() {
  return useMutation({
    mutationFn: (
      input: VerifyVideoPaymentInput,
    ): Promise<{
      error: string | null;
      result: VideoPaymentVerification | null;
    }> => verifyVideoPayment(input),
  });
}

export function useSubmitPaymentReceipt() {
  return useMutation({
    mutationFn: (input: SubmitPaymentReceiptInput): Promise<{ error: string | null }> =>
      submitPaymentReceipt(input),
  });
}
