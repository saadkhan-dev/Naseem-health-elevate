/**
 * Conversational Pakistani Roman Urdu writer.
 *
 * Urdu that flows through the voice-translation pipeline is written in the
 * script Azure Speech produces with its Urdu STT/translation (`ur`).
 * Pakistanis communicate in *Roman Urdu* — Urdu written with the Latin
 * alphabet (e.g. "Aap ko ye dard kab se ho raha hai?") — so every Urdu text
 * the interpreter surfaces in transcripts is converted to that conversational
 * form here.
 *
 * Design notes:
 *   - Phrase-level mapping is checked FIRST (whole normalized sentences tuned
 *     for the consultation — e.g. "آپ کو یہ درد کب سے ہو رہا ہے؟" →
 *     "Aap ko ye dard kab se ho raha hai?"). It always wins over the
 *     word-level dictionary so the most common conversational phrasings stay
 *     perfectly idiomatic regardless of how Azure splits them.
 *   - Then a word-level dictionary (this is what makes the output read
 *     naturally: common conversational + clinical words get their idiomatic
 *     Pakistani roman spelling), falling back to a per-letter mapping so
 *     unknown vocabulary still romanizes deterministically.
 *   - Non-Urdu text (Latin words like "blood pressure", digits, punctuation)
 *     passes through untouched.
 *   - Purely deterministic, stateless and side-effect free — safe to import
 *     from BOTH the browser engine and server code, and directly unit-testable.
 *
 * IMPORTANT: The AUDIBLE Urdu stays in its natural native script (fed to the
 * `ur-PK-AsadNeural` TTS voice so pronunciation is correct). This module only
 * rewrites the *written* Urdu for transcripts/display.
 */

// ---------------------------------------------------------------------------
// Phrase dictionary — whole normalized sentences that must keep a specific
// conversational Pakistani roman spelling. Checked BEFORE the word-level
// dictionary (and the per-letter fallback) so common clinical phrasings can
// never be mangled by tokenization. Keys are the `normalizeUrduPunctuation`
// output (no diacritics, Latin punctuation).
// ---------------------------------------------------------------------------

const PHRASE_MAP: Readonly<Record<string, string>> = {
  // Keys MUST be written in `normalizeUrduPunctuation` output form (Arabic
  // question mark `؟` → Latin `?`, Urdu commas → `,` ; `;`), because the lookup
  // runs against the ALREADY-normalized text.
  "آپ کو یہ درد کب سے ہو رہا ہے?": "Aap ko ye dard kab se ho raha hai?",
  "درد کب سے ہے?": "Dard kab se hai?",
  "میں نے کبھی یہ نہیں دیکھا": "Mein ne kabhi ye nahi dekha",
  "کیا آپ کو سر میں درد ہے?": "Kya aap ko sar mein dard hai?",
  "مجھے سر میں بہت درد ہو رہا ہے": "Mujhe sar mein bohat dard ho raha hai",
  "کیا آپ کو بخار محسوس ہو رہا ہے?": "Kya aap ko bukhar mehsoos ho raha hai?",
  "بخار کتنے دن سے ہے?": "Bukhar kitne din se hai?",
  "سانس لینے میں دشواری ہو رہی ہے": "Saans lene mein dushwari ho rahi hai",
  "بلڈ پریشر بہت زیادہ ہے": "Blood pressure bohat zyada hai",
  "کیا آپ نے آج دوا لی ہے?": "Kya aap ne aaj dawa li hai?",
  "پانی زیادہ پئیں": "Pani zyada peein",
  "آپ کو آرام کرنا ہے": "Aap ko aaram karna hai",
  "مجھے قے اور اسہال ہو رہا ہے": "Mujhe qai aur isal ho raha hai",
  "کھانا ٹھیک سے نہیں کھا سکتا": "Khana theek se nahi kha sakta",
  "دوائی دن میں تین بار لینی ہے": "Dawai din mein teen bar leni hai",
};

// ---------------------------------------------------------------------------
// Word dictionary — conversational + clinical vocabulary with the idiomatic
// Pakistani roman spelling. Without an entry a word falls back to the
// per-letter table below; add the words that matter for natural phrasing.
// ---------------------------------------------------------------------------

const DICTIONARY: Readonly<Record<string, string>> = {
  // Pronouns / polite address
  آپ: "aap",
  میں: "mein",
  مجھ: "mujh",
  مجھے: "mujhe",
  تجھے: "tujhe",
  ہم: "hum",
  ان: "un",
  انہوں: "unhon",
  اس: "is",
  انہیں: "unhain",
  اسے: "ise",
  کوئی: "koi",
  کچھ: "kuch",
  سب: "sab",
  سبھی: "sabhi",

  // Copula / auxiliaries & particles
  ہے: "hai",
  ہیں: "hain",
  ہوں: "hoon",
  ہو: "ho",
  تھا: "tha",
  تھی: "thi",
  تھے: "thay",
  گا: "ga",
  گی: "gi",
  گے: "gay",
  نہیں: "nahi",
  ہاں: "haan",
  بھی: "bhi",
  تو: "to",
  اور: "aur",
  کیا: "kya",
  کی: "ki",
  کے: "ke",
  کو: "ko",
  کا: "ka",
  کیونکہ: "kyunke",
  لیکن: "lekin",
  اگر: "agar",
  یہ: "ye",
  وہ: "woh",
  پھر: "phir",
  اب: "ab",
  پہلے: "pehle",
  بعد: "baad",
  سے: "se",
  پر: "par",
  تک: "tak",
  نے: "ne",
  نہ: "na",
  بھر: "bhar",
  وگرنہ: "warna",

  // Time / questions
  کب: "kab",
  کہاں: "kahan",
  کہیں: "kahin",
  کیوں: "kyun",
  کیسا: "kaisa",
  کیسی: "kaisi",
  کیسے: "kaise",
  کتنے: "kitne",
  کتنا: "kitna",
  کتنی: "kitni",
  دن: "din",
  رات: "raat",
  صبح: "subah",
  شام: "sham",
  کل: "kal",
  آج: "aaj",
  گھنٹے: "ghantay",
  ہفتہ: "haftha",
  مہینہ: "mahina",
  سال: "saal",
  وقت: "waqt",
  ابھی: "abhi",
  دیر: "dair",
  کبھی: "kabhi",
  والدین: "walidain",

  // Body / symptoms
  میرا: "mera",
  میری: "meri",
  میرے: "meray",
  رہا: "raha",
  رہی: "rahi",
  رہے: "rahay",
  ہوئی: "hui",
  درد: "dard",
  بخار: "bukhar",
  سر: "sar",
  پیٹ: "pait",
  پشت: "pusht",
  کمر: "kamarr",
  پیر: "peer",
  ہاتھ: "haath",
  ہاتھی: "haathi",
  پاؤں: "pawon",
  آنکھ: "aankh",
  کان: "kaan",
  ناک: "naak",
  منہ: "munh",
  گلا: "gala",
  چھاتی: "chhati",
  گردن: "gardan",
  جوڑوں: "joron",
  ہڈی: "haddi",
  پٹھے: "pithhay",
  جلد: "jild",
  سانس: "saans",
  "سانس لینے": "saans lene",
  کھانسی: "khansi",
  قے: "qai",
  اسہال: "isal",
  قبض: "qubz",
  بیماری: "bimari",
  دشواری: "dushwari",
  تکلیف: "takleef",
  علاج: "ilaj",
  مریض: "mareez",

  // Medicines / measurements
  دوا: "dawa",
  دوائی: "dawai",
  دواؤں: "dawaon",
  لی: "li",
  لینا: "lena",
  لینے: "lene",
  لینی: "leni",
  بلڈ: "blood",
  پریشر: "pressure",
  گولی: "goli",
  شربت: "sharbat",
  انجکشن: "injection",
  خون: "khoon",
  وزن: "wazan",
  "بلڈ پریشر": "blood pressure",
  شوگر: "sugar",
  کھانا: "khana",
  کھایا: "khaya",
  کھائی: "khai",
  پانی: "pani",
  پل: "pil",
  مرض: "marz",
  دماغ: "dimagh",
  دل: "dil",
  جگر: "jigar",
  گردے: "gurday",
  پھیپھڑے: "phayphray",

  // Clinic / numbers (frequently needed in 0–10 + teens)
  ایک: "ek",
  دو: "do",
  تین: "teen",
  چار: "chaar",
  پانچ: "paanch",
  چھ: "chhe",
  سات: "saat",
  آٹھ: "aath",
  نو: "no",
  دس: "das",
  بار: "bar",
  مرتبہ: "martaba",
  تیسرا: "teesra",
  پہلا: "pehla",
  آخری: "aakhri",

  // People / address
  ڈاکٹر: "doctor",
  صاحب: "sahab",
  صاحبہ: "sahiba",
  بھائی: "bhai",
  بیٹا: "beta",
  بیٹی: "beti",
  ماں: "maa",
  باپ: "baap",
  والد: "walid",
  والدہ: "walida",
  خاندان: "khandan",

  // Adjectives
  بہت: "bohat",
  زیادہ: "zyada",
  کم: "kam",
  بڑا: "bara",
  بڑی: "bari",
  بڑے: "baray",
  چھوٹا: "chhota",
  چھوٹی: "chhoti",
  علیحدہ: "alehda",
  نیا: "naya",
  نئی: "nai",
  پرانا: "purana",
  مشکل: "mushkil",
  آسان: "asaan",
  تھکاوٹ: "thakawat",
  خوف: "khauf",
  صحیح: "sahi",
  غلط: "ghalat",
  قریب: "qareeb",
  دور: "door",
  توانای: "tawanai",
  الرجی: "allergy",
  انفیکشن: "infection",
  حملہ: "hamla",
  آپریشن: "operation",
  ریڈیو: "radio",

  // Misc
  اسپتال: "hospital",
  دکان: "dukaan",
  گھر: "ghar",
  نشاط: "nishat",
};

// ---------------------------------------------------------------------------
// Per-letter fallback — used only when a word is not in the dictionary.
// ---------------------------------------------------------------------------

const CHAR_MAP: Readonly<Record<string, string>> = {
  ا: "a",
  آ: "aa",
  أ: "a",
  إ: "a",
  ب: "b",
  پ: "p",
  ت: "t",
  ٹ: "t",
  ث: "s",
  ج: "j",
  چ: "ch",
  ح: "h",
  خ: "kh",
  د: "d",
  ڈ: "d",
  ذ: "z",
  ر: "r",
  ڑ: "r",
  ز: "z",
  ژ: "zh",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "z",
  ط: "t",
  ظ: "z",
  ع: "",
  غ: "gh",
  ف: "f",
  ق: "q",
  ک: "k",
  گ: "g",
  ل: "l",
  م: "m",
  ن: "n",
  ں: "n",
  و: "w",
  ہ: "h",
  ھ: "h",
  ی: "y",
  ے: "e",
  ء: "",
  ؤ: "o",
  ئ: "",
  ۃ: "h",
  "٘": "",
  // Zalath / other marks commonly found pasted from Azure output
  "\u0650": "i", // kasra (short i)
  "\u064e": "a", // fatha
  "\u064f": "u", // damma
  "\u0651": "", // shadda → Roman Urdu drops it
  "\u064b": "n",
  "\u064d": "n",
  "\u0652": "", // sukun
};

/** Word-final kasra (izafat), e.g. "دردِ دل" → "dard-e dil". */
const IZAFAT_KASRA = "\u0650";

const URDU_CHAR_RE = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]$/;

function isUrduCodePoint(ch: string): boolean {
  return URDU_CHAR_RE.test(ch);
}

function isLatinLetter(ch: string): boolean {
  return /[A-Za-z]/.test(ch);
}

/**
 * Lower-level transliteration for a single word not present in the dictionary.
 * `و` (waw) is the only genuinely positional letter: word-final or followed by
 * a consonant it is a vowel sound ("do", "noor"), elsewhere a consonant "w".
 */
function transliterateWord(word: string): string {
  let out = "";
  const chars = Array.from(word);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!isUrduCodePoint(ch)) {
      out += ch;
      continue;
    }
    if (ch === "و" && i > 0) {
      const next = i + 1 < chars.length ? chars[i + 1] : null;
      const mappedNext = next ? (CHAR_MAP[next] ?? "") : "";
      // Word-final waw after a consonant = /o/ ("دو" → do). Medial waw
      // followed by a consonant = /o/ too ("نور" → noor, "بول" → bool).
      if (
        next === null ||
        (isUrduCodePoint(next) &&
          !mappedNext.startsWith("a") &&
          !mappedNext.startsWith("e") &&
          !mappedNext.startsWith("i") &&
          !mappedNext.startsWith("y"))
      ) {
        out += "o";
      } else {
        out += "w";
      }
      continue;
    }
    if (ch === "ی") {
      // Yeh is a consonant "y" when word-initial or after a vowel; a final
      // short "i" after a consonant ("لی" → li, "کی" → ki).
      const prev = i > 0 ? (CHAR_MAP[chars[i - 1]] ?? "") : "";
      const vowelEnding =
        prev.endsWith("a") ||
        prev.endsWith("e") ||
        prev.endsWith("i") ||
        prev.endsWith("o") ||
        prev.endsWith("u") ||
        prev === "y";
      out += i === 0 || vowelEnding ? "y" : "i";
      continue;
    }
    out += CHAR_MAP[ch] ?? "";
  }
  return out;
}

/**
 * Normalize the piece of Urdu text Azure produced: handle the izafat kasra
 * (end-of-word "ِ" → "-e"), strip the remaining diacritics/shadda marks, and
 * map Urdu punctuation to its Latin equivalents.
 */
function normalizeUrduPunctuation(text: string): string {
  return text
    .replace(/[،؛]/g, (m) => (m === "،" ? "," : ";"))
    .replace(/؟/g, "?")
    .replace(/۔\s*$/g, ".")
    .replace(/۔/g, ". ")
    .replace(/\u200C|\u200D|\u0640/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert a full phrase of Urdu (script) text into conversational Pakistani
 * Roman Urdu. Non-Urdu text — numbers, Latin words, punctuation — passes
 * through untouched, which is what keeps English-origin loanwords like
 * "بلڈ پریشر" → "blood pressure" reading naturally.
 *
 * @example `toRomanUrdu("آپ کو یہ درد کب سے ہو رہا ہے؟")`
 *   → `"Aap ko ye dard kab se ho raha hai?"`
 */
export function toRomanUrdu(text: string): string {
  const cleaned = normalizeUrduPunctuation(text);
  if (!cleaned) return cleaned;

  // Whole-phrase entries win: the most common consultation phrasings are mapped
  // verbatim so they read perfectly idiomatic regardless of tokenization.
  const phrase = PHRASE_MAP[cleaned];
  if (phrase) return phrase;

  // Split on spaces, but keep the punctuation attached to its word so the
  // sentence keeps its original punctuation (?, ., ,) positionally.
  const tokens = cleaned.split(" ");
  const roman = tokens.map((token) => {
    // Separate trailing punctuation from the word for lookup purposes.
    const trailing = token.match(/([?.,!;:"')\]})]*)$/)?.[0] ?? "";
    const lead = token.slice(0, token.length - trailing.length);
    const leadingPunct = lead.match(/^([(]*)/)?.[0] ?? "";
    const core = lead.slice(leadingPunct.length);

    // Completely non-Urdu token (Latin/digits): leave as-is.
    if (!Array.from(core).some(isUrduCodePoint)) {
      return token;
    }

    // Isolated izafat kasra → "-e".
    if (core === IZAFAT_KASRA) return leadingPunct + "-e " + trailing;

    let romanCore: string;
    const dict = DICTIONARY[core];
    if (dict) {
      romanCore = dict;
    } else {
      // End-of-word kasra is the izafat: "دردِ" → "dard-e".
      if (core.endsWith(IZAFAT_KASRA)) {
        const stem = core.slice(0, -1);
        romanCore = `${DICTIONARY[stem] ?? transliterateWord(stem)}-e`;
      } else {
        romanCore = transliterateWord(core);
      }
    }
    return `${leadingPunct}${romanCore}${trailing}`;
  });

  // Capitalize Urdu's counterpart of sentence-start capitalization which is
  // conventional (not mandatory) in Pakistani roman Urdu: first letter of the
  // first word. Only applied when the phrase actually contained Urdu script.
  let result = roman.join(" ");
  if (result && hasUrduScript(cleaned) && isLatinLetter(result[0])) {
    result = result[0].toUpperCase() + result.slice(1);
  }
  return result;
}

/** True when the string contains any Urdu/Arabic-script (RTL) code points. */
export function hasUrduScript(text: string): boolean {
  return Array.from(text).some(isUrduCodePoint);
}
