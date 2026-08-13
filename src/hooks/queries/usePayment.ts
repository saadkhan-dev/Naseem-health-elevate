import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getActivePaymentMethods,
  submitVideoPayment,
  type SubmitVideoPaymentInput,
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
