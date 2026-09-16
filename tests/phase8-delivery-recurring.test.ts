import { describe, expect, it } from "bun:test";
import {
  DEFAULT_STORE_SETTINGS,
  deliveryChargeLabel,
  grandTotal,
  normalizeStoreSettings,
  productDeliveryEstimate,
  productDeliveryLabel,
  resolveDeliveryCharge,
} from "../src/lib/delivery";
import {
  generateTimeSlots,
  type AvailabilitySlot,
  type CustomAvailabilitySlot,
  type RecurringAvailabilitySlot,
} from "../src/lib/bookings";

// 2026-08-17 is a Monday, 2026-08-23 is a Sunday.
const MON = new Date(2026, 7, 17, 12, 0, 0);
const SUN = new Date(2026, 7, 23, 12, 0, 0);

function window(day_of_week: number, start_time: string, end_time: string): AvailabilitySlot {
  return {
    id: `w-${day_of_week}-${start_time}`,
    day_of_week,
    start_time,
    end_time,
    is_available: true,
  };
}

function recurring(
  day_of_week: number,
  start_time: string,
  end_time: string,
  is_available = true,
): RecurringAvailabilitySlot {
  return {
    id: `r-${day_of_week}-${start_time}`,
    doctor_id: null,
    day_of_week,
    start_time,
    end_time,
    is_available,
    notes: null,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function custom(
  specific_date: string,
  start_time: string,
  end_time: string,
  is_available = true,
): CustomAvailabilitySlot {
  return {
    id: `c-${specific_date}-${start_time}`,
    doctor_id: null,
    specific_date,
    start_time,
    end_time,
    is_available,
    notes: null,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("delivery charge (order level, kept separate from product price)", () => {
  it("charges nothing when delivery charges are switched off (legacy behaviour)", () => {
    const settings = { ...DEFAULT_STORE_SETTINGS, delivery_charge: 200, delivery_is_active: false };
    expect(resolveDeliveryCharge(settings, 2500)).toBe(0);
    expect(grandTotal(settings, 2500)).toBe(2500);
  });

  it("adds the configured charge on top of the product subtotal", () => {
    const settings = { ...DEFAULT_STORE_SETTINGS, delivery_charge: 200, delivery_is_active: true };
    expect(resolveDeliveryCharge(settings, 2500)).toBe(200);
    expect(grandTotal(settings, 2500)).toBe(2700);
  });

  it("never mutates the product price — subtotal + delivery always equals the total", () => {
    const settings = { ...DEFAULT_STORE_SETTINGS, delivery_charge: 350, delivery_is_active: true };
    const subtotal = 1799;
    expect(grandTotal(settings, subtotal) - subtotal).toBe(350);
  });

  it("waives delivery once the free-delivery threshold is reached", () => {
    const settings = {
      ...DEFAULT_STORE_SETTINGS,
      delivery_charge: 200,
      free_delivery_threshold: 5000,
      delivery_is_active: true,
    };
    expect(resolveDeliveryCharge(settings, 4999)).toBe(200);
    expect(resolveDeliveryCharge(settings, 5000)).toBe(0);
    expect(grandTotal(settings, 5000)).toBe(5000);
  });

  it("treats a zero/negative configured charge as free", () => {
    expect(
      resolveDeliveryCharge(
        { ...DEFAULT_STORE_SETTINGS, delivery_charge: 0, delivery_is_active: true },
        1000,
      ),
    ).toBe(0);
    expect(
      resolveDeliveryCharge(
        { ...DEFAULT_STORE_SETTINGS, delivery_charge: -50, delivery_is_active: true },
        1000,
      ),
    ).toBe(0);
  });

  it("normalizes missing/legacy settings rows to the safe default", () => {
    expect(normalizeStoreSettings(null)).toEqual(DEFAULT_STORE_SETTINGS);
    expect(normalizeStoreSettings({})).toEqual(DEFAULT_STORE_SETTINGS);
    expect(
      normalizeStoreSettings({
        delivery_charge: 200,
        free_delivery_threshold: null,
        delivery_is_active: true,
        delivery_note: "  Within Karachi  ",
      }),
    ).toEqual({
      delivery_charge: 200,
      free_delivery_threshold: null,
      delivery_is_active: true,
      delivery_note: "Within Karachi",
    });
  });

  it("labels the applied charge", () => {
    expect(deliveryChargeLabel(200)).toBe("Rs. 200");
    expect(deliveryChargeLabel(0)).toBe("Free");
  });
});

describe("product estimated delivery time (optional)", () => {
  it("returns null for products without an estimate", () => {
    expect(productDeliveryEstimate({ delivery_estimate: null })).toBeNull();
    expect(productDeliveryEstimate({})).toBeNull();
    expect(productDeliveryEstimate({ delivery_estimate: "   " })).toBeNull();
    expect(productDeliveryLabel({ delivery_estimate: null })).toBeNull();
  });

  it("formats a set estimate", () => {
    expect(productDeliveryEstimate({ delivery_estimate: "3–5 days" })).toBe("3–5 days");
    expect(productDeliveryLabel({ delivery_estimate: "3–5 days" })).toBe("Delivery: 3–5 days");
  });
});

describe("generateTimeSlots with recurring weekly availability", () => {
  it("adds the recurring window on every matching weekday", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [],
      30,
      "",
      "",
      [],
      [recurring(1, "16:00", "17:00")],
    );
    expect(slots).toContain("16:00");
    expect(slots).toContain("16:30");
    expect(slots).toContain("19:00");
    expect(slots).toContain("22:30");
  });

  it("ignores a recurring slot for a different weekday", () => {
    const slots = generateTimeSlots([], SUN, [], 30, "", "", [], [recurring(1, "16:00", "19:00")]);
    expect(slots).toEqual([]);
  });

  it("opens a normally-closed weekday (recurring Sunday slot, no regular hours)", () => {
    const slots = generateTimeSlots([], SUN, [], 30, "", "", [], [recurring(0, "16:00", "18:00")]);
    expect(slots).toEqual(["16:00", "16:30", "17:00", "17:30"]);
  });

  it("deduplicates a recurring window that overlaps the regular schedule", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [],
      30,
      "",
      "",
      [],
      [recurring(1, "18:00", "20:00")],
    );
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots.filter((t) => t === "19:00")).toHaveLength(1);
  });

  it("deduplicates recurring + one-time + regular windows together", () => {
    const slots = generateTimeSlots(
      [window(1, "19:00", "23:00")],
      MON,
      [],
      30,
      "",
      "",
      [custom("2026-08-17", "18:30", "19:30")],
      [recurring(1, "18:00", "19:00")],
    );
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots.slice(0, 4)).toEqual(["18:00", "18:30", "19:00", "19:30"]);
  });

  it("filters out recurring slots marked unavailable", () => {
    const slots = generateTimeSlots(
      [],
      SUN,
      [],
      30,
      "",
      "",
      [],
      [recurring(0, "16:00", "18:00", false)],
    );
    expect(slots).toEqual([]);
  });

  it("keeps booked intervals blocked even inside a recurring window", () => {
    const slots = generateTimeSlots(
      [],
      SUN,
      [{ slot: "16:30", durationMinutes: 30 }],
      30,
      "",
      "",
      [],
      [recurring(0, "16:00", "18:00")],
    );
    expect(slots).toEqual(["16:00", "17:00", "17:30"]);
  });
});
