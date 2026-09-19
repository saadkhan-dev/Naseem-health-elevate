import { describe, expect, it } from "bun:test";
import { hasUrduScript, toRomanUrdu } from "../src/lib/roman-urdu";

describe("toRomanUrdu — conversational Pakistani Roman Urdu", () => {
  it("converts a full conversational question like the interpreter's target output", () => {
    expect(toRomanUrdu("آپ کو یہ درد کب سے ہو رہا ہے؟")).toBe("Aap ko ye dard kab se ho raha hai?");
  });

  it("fever duration", () => {
    expect(toRomanUrdu("بخار کتنے دن سے ہے؟")).toBe("Bukhar kitne din se hai?");
  });

  it("personal statement with location", () => {
    expect(toRomanUrdu("مجھے سر میں درد ہے")).toBe("Mujhe sar mein dard hai");
  });

  it("medication question", () => {
    expect(toRomanUrdu("کیا آپ نے دوائی لی ہے؟")).toBe("Kya aap ne dawai li hai?");
  });

  it("compound statement with negation", () => {
    expect(toRomanUrdu("میں نے کل رات سے کھانا نہیں کھایا")).toBe(
      "Mein ne kal raat se khana nahi khaya",
    );
  });

  it("respectful address + difficulty breathing", () => {
    expect(toRomanUrdu("ڈاکٹر صاحب، مجھے سانس لینے میں دشواری ہو رہی ہے")).toBe(
      "Doctor sahab, mujhe saans lene mein dushwari ho rahi hai",
    );
  });

  it("dosage instruction", () => {
    expect(toRomanUrdu("یہ دوا دن میں تین بار لینی ہے")).toBe("Ye dawa din mein teen bar leni hai");
  });

  it("allergy question", () => {
    expect(toRomanUrdu("کیا آپ کو الرجی ہے؟")).toBe("Kya aap ko allergy hai?");
  });

  it("symptom pair", () => {
    expect(toRomanUrdu("پیٹ میں درد اور قے ہو رہی ہے")).toBe("Pait mein dard aur qai ho rahi hai");
  });

  it("English loanwords (بلڈ پریشر) read naturally", () => {
    expect(toRomanUrdu("آپ کا بلڈ پریشر بہت زیادہ ہے")).toBe(
      "Aap ka blood pressure bohat zyada hai",
    );
  });

  it("clinic visit tomorrow morning", () => {
    expect(toRomanUrdu("کل صبح اسپتال آنا ہے")).toBe("Kal subah hospital aana hai");
  });

  it("weight question", () => {
    expect(toRomanUrdu("آپ کا وزن کتنا ہے؟")).toBe("Aap ka wazan kitna hai?");
  });

  it("handles empty / non-Urdu input", () => {
    expect(toRomanUrdu("")).toBe("");
    expect(toRomanUrdu("blood pressure 120/80")).toBe("blood pressure 120/80");
    expect(toRomanUrdu("   ")).toBe("");
  });

  it("maps Urdu punctuation to Latin", () => {
    expect(toRomanUrdu("ہاں۔") ?? "").toBe("Haan.");
    expect(toRomanUrdu("کیا؟")).toBe("Kya?");
  });
});

describe("toRomanUrdu — phrase-level priority", () => {
  it("whole-phrase entries win over the word dictionary", () => {
    expect(toRomanUrdu("آپ کو یہ درد کب سے ہو رہا ہے؟")).toBe("Aap ko ye dard kab se ho raha hai?");
    expect(toRomanUrdu("کب تک آپ کو یہ درد کب سے ہو رہا ہے؟")).toBe(
      "Kab tak aap ko ye dard kab se ho raha hai?", // word-level tail; phrase key intact only when it matches exactly
    );
  });

  it("matches normalized punctuation-only variants of a phrase", () => {
    expect(toRomanUrdu("کیا آپ کو سر میں درد ہے؟")).toBe("Kya aap ko sar mein dard hai?");
    expect(toRomanUrdu("کیا آپ کو بخار محسوس ہو رہا ہے؟")).toBe(
      "Kya aap ko bukhar mehsoos ho raha hai?",
    );
  });

  it("maps symptom and instruction phrases", () => {
    expect(toRomanUrdu("سانس لینے میں دشواری ہو رہی ہے")).toBe(
      "Saans lene mein dushwari ho rahi hai",
    );
    expect(toRomanUrdu("پانی زیادہ پئیں")).toBe("Pani zyada peein");
    expect(toRomanUrdu("آپ کو آرام کرنا ہے")).toBe("Aap ko aaram karna hai");
    expect(toRomanUrdu("دوائی دن میں تین بار لینی ہے")).toBe("Dawai din mein teen bar leni hai");
  });

  it("keeps the word dictionary for anything outside the phrase table", () => {
    expect(toRomanUrdu("بخار کتنے دن سے ہے؟")).toBe("Bukhar kitne din se hai?");
    expect(toRomanUrdu("آپ کا وزن کتنا ہے؟")).toBe("Aap ka wazan kitna hai?");
  });
});

describe("hasUrduScript", () => {
  it("detects script text", () => {
    expect(hasUrduScript("ہو رہا ہے")).toBe(true);
    expect(hasUrduScript("hello doctor")).toBe(false);
    expect(hasUrduScript("")).toBe(false);
  });
});
