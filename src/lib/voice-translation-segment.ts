/**
 * Pure speech-segmentation for the sender-side voice-translation pipeline.
 *
 * Azure's TranslationRecognizer delivers a growing series of FINAL (phrase-level)
 * results while the user talks: each phrase is a strict superset of the previous
 * one ("آپ کو کمر" → "آپ کو کمر میں درد کب سے ہو رہا ہے"). This module turns that
 * growing series into COMPLETE, meaningful utterances that are safe to send to
 * the TTS:
 *
 *   - Consecutive finals that overlap (the new final starts with the held text)
 *     REPLACE the held text and keep waiting, so we never speak a half sentence.
 *   - A final that ends with a sentence terminator (`.` `?` `!` `۔` `؟` `…`)
 *     and has reached a minimum length is emitted as one complete segment.
 *   - To keep latency bounded, a non-terminated hold is emitted once it has
 *     waited `maxHoldMs` and reached `minChars`; an over-long hold is re-flushed
 *     when the next final arrives.
 *   - `reset()` is called on recognizer recreation / language change / disable so
 *     no stale partial crosses a language boundary.
 *
 * Everything here is a pure state machine (no DOM/Audio), so it is unit-tested
 * in `tests/voice-translation-segment.test.ts`.
 */

export interface SegmentAssemblerOptions {
  /** Minimum segment length (chars) before it can be emitted. */
  minChars?: number;
  /** Max time (ms) to hold a non-tagged partial before emitting it. */
  maxHoldMs?: number;
  /** Single-utterance safety cap (chars) — never speak more than this per segment. */
  hardMaxChars?: number;
  /** Sentence terminators — the segment END must match this to be "complete". */
  sentenceEnd?: RegExp;
}

// Terminators: `.` `?` `!` `۔` (Arabic-script full stop), `؟` (Arabic question
// mark) and `…`. `maxHoldMs` is tuned for clinical speech: Urdu consultation
// sentences routinely run 6-10 seconds with several conjunct clauses before the
// final terminator lands (e.g. "جب میں زیادہ دیر بیٹھتا ہوں تو درد بڑھ جاتا ہے
// اور کبھی کبھی ٹانگ سن بھی ہو جاتی ہے۔"). Holding a little longer trades a
// fraction of TTS latency for WHOLE-SENTENCE context — the engine never speaks
// a half-formed clause that Azure was about to grow into the complete thought.
const DEFAULTS: Required<SegmentAssemblerOptions> = {
  minChars: 8,
  maxHoldMs: 3600,
  hardMaxChars: 220,
  sentenceEnd: /[.!?।۔؟……]\s*$/u,
};

export class SegmentAssembler {
  private chunks: string[] = [];
  private since: number | null = null;
  private readonly o: Required<SegmentAssemblerOptions>;

  constructor(opts: SegmentAssemblerOptions = {}) {
    this.o = { ...DEFAULTS, ...opts };
  }

  get held(): string {
    return this.chunks.join(" ");
  }

  get holding(): boolean {
    return this.chunks.length > 0;
  }

  reset(): void {
    this.chunks = [];
    this.since = null;
  }

  /**
   * Feed one FINAL recognition result. Returns the complete segment to speak
   * (and clears the hold), or `null` when the fragment is still incomplete.
   * `now` may be injected for deterministic tests.
   */
  push(final: string, now: number = Date.now()): string | null {
    const t = (final ?? "").trim().replace(/\s+/g, " ");
    if (t.length === 0) {
      this.reset();
      return null;
    }
    if (this.since === null) this.since = now;
    const elapsed = now - this.since;

    const held = this.held;

    if (held.length > 0 && t.startsWith(held)) {
      // Same utterance, grown: replace the hold with the fuller final. This
      // takes precedence over expiry — a resumed (though slow) utterance must
      // never be cut or doubled.
      this.chunks = [t];
    } else if (held.length > 0 && held.startsWith(t)) {
      // Strict prefix of the held text — an Azure duplicate of an earlier
      // partial; keep waiting for the full utterance.
      this.chunks = [t];
    } else if (held.length > 0 && elapsed >= this.o.maxHoldMs) {
      // The previous hold never completed; emit it as a bounded clause NOW so
      // we never wait forever, then start a fresh hold with the new final.
      this.reset();
      this.since = now;
      this.chunks = [t];
      const fresh = this.held;
      if (this.o.sentenceEnd.test(fresh) && fresh.length >= this.o.minChars) {
        this.reset();
        return fresh;
      }
      return held;
    } else {
      this.chunks.push(t);
    }

    const text = this.held;
    const endsSentence = this.o.sentenceEnd.test(text);
    if (
      (endsSentence && text.length >= this.o.minChars) ||
      text.length >= this.o.hardMaxChars ||
      (!endsSentence && elapsed >= this.o.maxHoldMs && text.length >= this.o.minChars)
    ) {
      this.reset();
      return text;
    }
    return null;
  }
}
