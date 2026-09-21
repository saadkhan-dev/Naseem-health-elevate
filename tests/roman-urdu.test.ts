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

  it("prescribed E2E sentences keep their idiomatic roman spelling (with and without terminator)", () => {
    expect(toRomanUrdu("مجھے تین دن سے کمر میں بہت درد ہے اور درد دائیں ٹانگ تک جا رہا ہے۔")).toBe(
      "Mujhe teen din se kamarr mein bohat dard hai aur dard dayen tang tak ja raha hai.",
    );
    expect(toRomanUrdu("مجھے تین دن سے کمر میں بہت درد ہے اور درد دائیں ٹانگ تک جا رہا ہے")).toBe(
      "Mujhe teen din se kamarr mein bohat dard hai aur dard dayen tang tak ja raha hai",
    );
    expect(
      toRomanUrdu(
        "جب میں زیادہ دیر بیٹھتا ہوں تو درد بڑھ جاتا ہے اور کبھی کبھی ٹانگ سن بھی ہو جاتی ہے۔",
      ),
    ).toBe(
      "Jab mein zyada dair baithta hoon to dard barh jata hai aur kabhi kabhi tang sun bhi ho jati hai.",
    );
    expect(toRomanUrdu("میں نے پہلے درد کی دوا لی تھی لیکن اس سے زیادہ فرق نہیں پڑا۔")).toBe(
      "Mein ne pehle dard ki dawa li thi lekin is se zyada farq nahi para.",
    );
    expect(toRomanUrdu("میں نے پہلے painkiller لی تھی لیکن اس سے زیادہ فرق نہیں پڑا")).toBe(
      "Mein ne pehle painkiller li thi lekin is se zyada farq nahi para",
    );
    expect(
      toRomanUrdu(
        "آپ کو یہ درد کب سے ہو رہا ہے اور کیا چلنے یا سیڑھیاں چڑھنے سے درد زیادہ ہوتا ہے؟",
      ),
    ).toBe(
      "Aap ko ye dard kab se ho raha hai aur kya chalne ya seerhiyan charne se dard zyada hota hai?",
    );
  });

  it("expanded medical vocabulary (body sides, numbness, swelling, vitals)", () => {
    expect(toRomanUrdu("درد دائیں طرف ہے")).toBe("Dard dayen taraf hai");
    expect(toRomanUrdu("میری ٹانگ سن ہو گئی ہے")).toBe("Meri tang sun ho gayi hai");
    expect(toRomanUrdu("کیا آپ کو سوجن ہے؟")).toBe("Kya aap ko soojan hai?");
    expect(toRomanUrdu("آپ کا بلڈ پریشر کتنا ہے؟")).toBe("Aap ka blood pressure kitna hai?");
    expect(toRomanUrdu("آپ کو فوراً اسپتال آنا ہے")).toBe("Aap ko foran hospital aana hai");
    expect(toRomanUrdu("یہ کوئی خطرناک بیماری نہیں ہے")).toBe("Ye koi khatarnak bimari nahi hai");
  });

  it("mixed EN/UR medical tokens keep their Latin form", () => {
    expect(toRomanUrdu("آپ کی دوا ختم ہو گئی ہے")).toBe("Aap ki dawa khatam ho gayi hai");
    expect(toRomanUrdu("میرے پاس رپورٹ ہے")).toBe("Meray paas report hai");
    expect(toRomanUrdu("ٹیسٹ کرائیں")).toBe("Test karaain");
  });

  it("keeps the word dictionary for anything outside the phrase table", () => {
    expect(toRomanUrdu("بخار کتنے دن سے ہے؟")).toBe("Bukhar kitne din se hai?");
    expect(toRomanUrdu("آپ کا وزن کتنا ہے؟")).toBe("Aap ka wazan kitna hai?");
  });
});

describe("toRomanUrdu — everyday natural-phrasing expansions", () => {
  it("walks / stairs / postures read naturally", () => {
    expect(toRomanUrdu("کیا درد چلنے سے بڑھتا ہے؟")).toBe("Kya dard chalne se barhta hai?");
    expect(toRomanUrdu("کیا آپ سیڑھیاں چڑھ سکتے ہیں؟")).toBe("Kya aap seerhiyan charh sakte hain?");
    expect(toRomanUrdu("مجھے سیڑھیاں چڑھنے میں مشکل ہوتی ہے۔")).toBe(
      "Mujhe seerhiyan charhne mein mushkil hoti hai.",
    );
    expect(toRomanUrdu("کیا درد اٹھتے وقت زیادہ ہوتا ہے؟")).toBe(
      "Kya dard uthate waqt zyada hota hai?",
    );
    expect(toRomanUrdu("میں زیادہ دیر بیٹھ نہیں سکتا۔")).toBe("Mein zyada dair baith nahi sakta.");
  });

  it("spread / numbness / stiffness sentences stay idiomatic", () => {
    expect(toRomanUrdu("درد دائیں ٹانگ تک پھیل رہا ہے۔")).toBe(
      "Dard dayen tang tak phail raha hai.",
    );
    expect(toRomanUrdu("میری ٹانگ سن ہو جاتی ہے۔")).toBe("Meri tang sun ho jati hai.");
    expect(toRomanUrdu("میری کمر اکڑ جاتی ہے۔")).toBe("Meri kamarr akarh jati hai.");
    expect(toRomanUrdu("درد میں جھنجھناہٹ بھی ہوتی ہے۔")).toBe(
      "Dard mein jhunjhunaht bhi hoti hai.",
    );
  });

  it("sleep / appetite / breathing daily-life questions", () => {
    expect(toRomanUrdu("کیا آپ کی نیند ٹھیک آتی ہے؟")).toBe("Kya aap ki neend theek aati hai?");
    expect(toRomanUrdu("مجھے نیند نہیں آ رہی۔")).toBe("Mujhe neend nahi aa rahi.");
    expect(toRomanUrdu("بھوک کم لگتی ہے۔")).toBe("Bhukh kam lagti hai.");
    expect(toRomanUrdu("سانس پھولتی ہے۔")).toBe("Saans phoolti hai.");
    expect(toRomanUrdu("میں چل نہیں سکتا۔")).toBe("Mein chal nahi sakta.");
  });

  it("follow-up / vitals / medication-failure sentences", () => {
    expect(toRomanUrdu("درد رات کو زیادہ ہوتا ہے۔")).toBe("Dard raat ko zyada hota hai.");
    expect(toRomanUrdu("میرا بلڈ پریشر بڑھ گیا ہے۔")).toBe("Mera blood pressure barh gaya hai.");
    expect(toRomanUrdu("شوگر زیادہ ہو گئی ہے.")).toBe("Sugar zyada ho gayi hai.");
    expect(toRomanUrdu("دوا ختم ہو گئی ہے.")).toBe("Dawa khatam ho gayi hai.");
    expect(toRomanUrdu("دوا کی خوراک کتنی ہے؟")).toBe("Dawa ki khorak kitni hai?");
    expect(toRomanUrdu("آپ نے کون سی دوا لی تھی؟")).toBe("Aap ne kaun si dawa li thi?");
    expect(toRomanUrdu("مجھے کھانا کھانے کے بعد درد ہوتا ہے.")).toBe(
      "Mujhe khana khaane ke baad dard hota hai.",
    );
    expect(toRomanUrdu("آپ کو اسپتال جانا پڑے گا.")).toBe("Aap ko hospital jana pare ga.");
  });
});

describe("hasUrduScript", () => {
  it("detects script text", () => {
    expect(hasUrduScript("ہو رہا ہے")).toBe(true);
    expect(hasUrduScript("hello doctor")).toBe(false);
    expect(hasUrduScript("")).toBe(false);
  });
});
