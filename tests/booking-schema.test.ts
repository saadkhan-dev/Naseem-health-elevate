import { describe, expect, it } from "bun:test";
import { bookingSchema, recoverSchema } from "../src/lib/booking-schema";

const base = {
  name: "Ali Khan",
  serviceId: "11111111-1111-1111-1111-111111111111",
  date: "2026-09-01",
  time: "19:00",
};

describe("bookingSchema — contact requirements", () => {
  it("accepts a phone number only (no email)", () => {
    const r = bookingSchema.safeParse({ ...base, phone: "+923001234567" });
    expect(r.success).toBe(true);
  });

  it("accepts an email only (no phone)", () => {
    const r = bookingSchema.safeParse({ ...base, email: "ali@example.com" });
    expect(r.success).toBe(true);
  });

  it("accepts both phone and email", () => {
    const r = bookingSchema.safeParse({
      ...base,
      phone: "+923001234567",
      email: "ali@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when neither phone nor email is provided", () => {
    const r = bookingSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.code === "custom")).toBe(true);
    }
  });

  it("rejects an invalid email when email is provided", () => {
    const r = bookingSchema.safeParse({ ...base, email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("lowercases the email", () => {
    const r = bookingSchema.safeParse({ ...base, email: "Ali@Example.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ali@example.com");
  });
});

describe("recoverSchema — Find My Appointment validation", () => {
  it("accepts name + phone (no email)", () => {
    const r = recoverSchema.safeParse({ name: "Ali Khan", phone: "+923001234567" });
    expect(r.success).toBe(true);
  });

  it("accepts name + email (no phone)", () => {
    const r = recoverSchema.safeParse({ name: "Ali Khan", email: "ali@example.com" });
    expect(r.success).toBe(true);
  });

  it("accepts name + both phone and email", () => {
    const r = recoverSchema.safeParse({
      name: "Ali Khan",
      phone: "+923001234567",
      email: "ali@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bare name — name alone must never match", () => {
    const r = recoverSchema.safeParse({ name: "Ali Khan" });
    expect(r.success).toBe(false);
  });

  it("rejects when name is missing even if contact is provided", () => {
    const r = recoverSchema.safeParse({ phone: "+923001234567" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = recoverSchema.safeParse({ name: "Ali Khan", email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("lowercases the email", () => {
    const r = recoverSchema.safeParse({ name: "Ali Khan", email: "Ali@Example.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ali@example.com");
  });
});
