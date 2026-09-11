import { describe, expect, it } from "bun:test";
import { isOfferActive, isOfferVisible } from "../src/lib/video-offer-types";

type Offer = Parameters<typeof isOfferActive>[0];

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    is_active: true,
    start_date: "2026-08-20",
    end_date: "2026-11-20",
    ...overrides,
  };
}

describe("isOfferVisible — DISPLAY rule (active + upcoming, end date inclusive)", () => {
  it("shows an upcoming offer before its start date", () => {
    expect(isOfferVisible(offer({ start_date: "2026-08-20" }), "2026-08-13")).toBe(true);
  });

  it("shows an active offer inside its window", () => {
    expect(isOfferVisible(offer(), "2026-09-01")).toBe(true);
  });

  it("keeps the offer visible for the whole of its end date (inclusive)", () => {
    expect(isOfferVisible(offer(), "2026-11-20")).toBe(true);
  });

  it("hides the offer the day after its end date", () => {
    expect(isOfferVisible(offer(), "2026-11-21")).toBe(false);
  });

  it("shows an open-ended offer forever", () => {
    expect(isOfferVisible(offer({ end_date: null }), "2099-01-01")).toBe(true);
  });

  it("hides an offer the admin deactivated", () => {
    expect(isOfferVisible(offer({ is_active: false }), "2026-09-01")).toBe(false);
  });
});

describe("isOfferActive — PRICE rule (start reached, end date inclusive)", () => {
  it("does NOT discount the price before the start date", () => {
    expect(isOfferActive(offer({ start_date: "2026-08-20" }), "2026-08-13")).toBe(false);
  });

  it("activates on the start date", () => {
    expect(isOfferActive(offer({ start_date: "2026-08-20" }), "2026-08-20")).toBe(true);
  });

  it("stays active through the end date (inclusive)", () => {
    expect(isOfferActive(offer(), "2026-11-20")).toBe(true);
  });

  it("deactivates the day after the end date", () => {
    expect(isOfferActive(offer(), "2026-11-21")).toBe(false);
  });

  it("is never active for a deactivated offer even inside the window", () => {
    expect(isOfferActive(offer({ is_active: false }), "2026-09-01")).toBe(false);
  });
});
