import { z } from "zod";

/**
 * Shared validation for the public guest booking form.
 *
 * A patient must provide a name and at least ONE contact method — phone number
 * or email. Either (or both) is accepted so the clinic can send the
 * Appointment ID by SMS/WhatsApp and/or email.
 */
export const bookingSchema = z
  .object({
    name: z.string().trim().min(2, "Please enter your name").max(100),
    phone: z.string().trim().min(7, "Please enter a valid phone number").max(30).optional(),
    email: z.string().trim().email("Please enter a valid email").max(200).toLowerCase().optional(),
    serviceId: z.string().uuid("Invalid id"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    // Optional because flexible services (Home Visit) have no fixed slot —
    // the doctor confirms the time. The server rejects a missing time for
    // every other service.
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time")
      .optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.phone || v.email, {
    message: "Please enter your phone number or email so we can send your Appointment ID.",
  });

/**
 * Shared validation for the public "Find My Appointment" recovery form.
 *
 * A patient must give the name used at booking AND at least one contact
 * method (phone or email). The server never matches on a bare name — it always
 * ANDs the name with a verified contact method, so other patients' appointments
 * cannot be enumerated by guessing names.
 */
export const recoverSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name as used during booking").max(100),
    phone: z.string().trim().min(7, "Please enter a valid phone number").max(30).optional(),
    email: z.string().trim().email("Please enter a valid email").max(200).toLowerCase().optional(),
  })
  .refine((v) => v.phone || v.email, {
    message: "Enter your phone number or email.",
  });

/**
 * Shared validation for the patient's prepaid Video Consultation payment
 * submission. Proof = transaction/reference ID + payer name (+ the chosen
 * payment method). Lives here (not in `payment.ts`) so the server functions
 * can import it without a circular import (`payment.ts` imports the server
 * function wrapper).
 */
export const submitPaymentSchema = z.object({
  appointmentId: z.string().uuid("Invalid appointment id"),
  methodId: z.string().uuid("Invalid payment method"),
  reference: z
    .string()
    .trim()
    .min(3, "Enter the transaction / reference ID from your payment")
    .max(200),
  payerName: z.string().trim().min(2, "Enter the name the payment was made from").max(100),
});
