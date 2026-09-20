import { describe, expect, it } from "bun:test";
import { SegmentAssembler } from "../src/lib/voice-translation-segment";

/** Short hold times so the tests are fast and deterministic. */
const fast = { minChars: 4, maxHoldMs: 1000, hardMaxChars: 120 };

describe("SegmentAssembler — smart sentence segmentation (vo translation speech)", () => {
  it("holds growing finals of the SAME utterance and speaks the complete sentence once", () => {
    const a = new SegmentAssembler(fast);
    const t0 = 0;
    expect(a.push("آپ کو کمر", t0)).toBeNull();
    expect(a.push("آپ کو کمر میں درد", t0 + 10)).toBeNull();
    expect(a.push("آپ کو کمر میں درد کب سے ہو رہا ہے؟", t0 + 20)).toBe(
      "آپ کو کمر میں درد کب سے ہو رہا ہے؟",
    );
    expect(a.holding).toBe(false);
  });

  it("never speaks a half sentence when the full final lands later", () => {
    const a = new SegmentAssembler(fast);
    expect(a.push("مریض سے پوچھیں کہ کیا درد", 0)).toBeNull();
    expect(a.push("مریض سے پوچھیں کہ کیا درد سینے میں ہے؟", 5)).toBe(
      "مریض سے پوچھیں کہ کیا درد سینے میں ہے؟",
    );
  });

  it("treats a fresh utterance as a new segment", () => {
    const a = new SegmentAssembler(fast);
    expect(a.push("کمر میں درد کب سے ہے؟", 0)).toBe("کمر میں درد کب سے ہے؟");
    expect(a.push("یہ دوا دن میں دو بار لیں۔", 0)).toBe("یہ دوا دن میں دو بار لیں۔");
  });

  it("emits a bounded partial after maxHoldMs instead of waiting forever", () => {
    const a = new SegmentAssembler(fast);
    expect(a.push("میں نے دو دن", 0)).toBeNull();
    expect(a.push("میں نے دو دن سے کمر", 100)).toBeNull();
    // Still not sentence-complete AND under maxHold → hold.
    expect(a.push("میں نے دو دن سے کمر کا علاج کروایا،", 500)).toBeNull();
    // maxHold passes; the next final forces the emit of the accumulated clause.
    expect(a.push("صبح جاگ کر دیکھا درد ختم تھا", 1100)).toBe(
      "میں نے دو دن سے کمر کا علاج کروایا،",
    );
  });

  it("drops stale partials on reset (language change / disable)", () => {
    const a = new SegmentAssembler(fast);
    a.push("پرانی زبان کا جملہ جو ادھورا ہے", 0);
    a.reset();
    expect(a.holding).toBe(false);
    expect(a.push("نئی زبان میں مکمل جملہ ہے۔", 0)).toBe("نئی زبان میں مکمل جملہ ہے۔");
  });

  it("collapses whitespace and ignores empty finals", () => {
    const a = new SegmentAssembler(fast);
    expect(a.push("   ", 0)).toBeNull();
    expect(a.push("درد   ", 0)).toBeNull();
    expect(a.push("درد  ہے؟", 1)).toBe("درد ہے؟");
  });

  it("supports English sentence terminators", () => {
    const a = new SegmentAssembler(fast);
    expect(a.push("I have had back pain", 0)).toBeNull();
    expect(a.push("I have had back pain for three days", 10)).toBeNull();
    expect(a.push("I have had back pain for three days.", 20)).toBe(
      "I have had back pain for three days.",
    );
  });

  it("hard cap flushes a single runaway utterance", () => {
    const a = new SegmentAssembler({ minChars: 0, maxHoldMs: 100000, hardMaxChars: 120 });
    const one = "ایک ";
    expect(a.push(one.repeat(20), 0)).toBeNull();
    expect(a.push(one.repeat(30), 5)).toBeNull();
    // Same utterance grown past the cap → emitted whole (never split mid-word).
    expect(a.push(one.repeat(50), 10)).toBe(one.repeat(50).trim());
  });

  it("default hold keeps long multi-clause clinical sentences WHOLE (sentence context)", () => {
    // Default maxHoldMs is 3600ms (tuned for 6-10s Urdu consultation sentences
    // with conjunct clauses). A clause that lands 3s after the start is NOT
    // force-emitted as a half-sentence — it stays merged until the terminator.
    const a = new SegmentAssembler();
    expect(a.push("میں نے یہ درد پہلی بار محسوس کیا", 0)).toBeNull();
    expect(a.push("جب میں سیدھا کھڑا ہوتا ہوں", 3000)).toBeNull();
    const complete =
      "میں نے یہ درد پہلی بار محسوس کیا جب میں سیدھا کھڑا ہوتا ہوں تو درد بڑھ جاتا ہے۔";
    expect(a.push(complete, 6000)).toBe(complete);
    expect(a.holding).toBe(false);
  });
});
