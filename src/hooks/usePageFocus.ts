import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { parseFocusTarget, type PageFocus } from "@/lib/admin-focus";

const HIGHLIGHT_CLASS = "focus-flash";
const HIGHLIGHT_DURATION_MS = 2600;
const FOCUS_ATTRIBUTE = "data-focus-id";
const RETRY_DELAY_MS = 120;
/** How long `perform` waits for the row element to appear before giving up. */
const FIND_ROW_LIMIT_MS = 3000;
/** Poll interval of the persistent scroll guard (cheap; see the guard comment). */
const GUARD_TICK_MS = 120;
/** How long past the URL strip the guard keeps correcting (covers late resets). */
const GUARD_BUFFER_MS = 1600;

/**
 * Scroll the focused row to the vertical center of the viewport. Plain
 * `scrollIntoView` routes through the CSS `scroll-behavior: smooth` the app
 * sets on `<html>`, whose animation gets cancelled mid-flight while the table
 * mounts rows lazily (Chromium quirk). We neutralise that with an inline
 * `scroll-behavior: auto` override and force `behavior: "instant"` so the jump
 * lands without animation. Native scrollIntoView then scrolls EVERY
 * intermediate scroller (the document as well as any transiently scrollable
 * inner containers) in one coherent motion — hand-rolling that by walking
 * ancestors is fragile because a container's `scrollHeight` can change as
 * rows finish loading, turning a real scroll into a silent no-op and leaving
 * the row offscreen.
 *
 * Corrections can overlap (guard tick landing while a previous jump's restore
 * is still pending). The restore is therefore de-duplicated: only the LAST
 * pending restore wins, and it always restores the behavior captured before
 * the FIRST override — an interleaved pair of calls can never leave
 * `scroll-behavior: auto` stuck inline (which would silently break the app's
 * smooth scrolling until reload).
 */
let pendingBehaviorRestore: number | undefined;
let originalScrollBehavior: string | null = null;
function scrollFocusedRowIntoView(el: HTMLElement) {
  const htmlEl = document.documentElement;
  if (pendingBehaviorRestore === undefined) {
    originalScrollBehavior = htmlEl.style.scrollBehavior;
  } else {
    window.clearTimeout(pendingBehaviorRestore);
  }
  htmlEl.style.scrollBehavior = "auto";

  const jumpTo = () => {
    try {
      el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "center" });
      return;
    } catch {
      /* fall through to manual centering below */
    }
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 720;
    const targetTop = Math.max(0, rect.top + (window.scrollY || 0) - vh / 2 + rect.height / 2);
    const scroller = document.scrollingElement || htmlEl;
    scroller.scrollTo({ top: targetTop, behavior: "instant" as ScrollBehavior });
  };

  try {
    jumpTo();
    // Re-measure after the browser commits the layout change; if the row is
    // still outside the viewport (content shifted during the jump), retry.
    pendingBehaviorRestore = window.setTimeout(() => {
      pendingBehaviorRestore = undefined;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      const outside = rect.bottom < 0 || rect.top > vh || rect.top < 0 || rect.bottom > vh;
      if (outside) jumpTo();
      htmlEl.style.scrollBehavior = originalScrollBehavior ?? "";
    }, 130);
  } catch {
    if (pendingBehaviorRestore !== undefined) {
      window.clearTimeout(pendingBehaviorRestore);
      pendingBehaviorRestore = undefined;
    }
    htmlEl.style.scrollBehavior = originalScrollBehavior ?? "";
    // Fallback — best-effort native behavior if anything above throws.
    try {
      el.scrollIntoView({ behavior: "auto", block: "center" });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Read the `?focus=...&id=...` deep-link params current navigation carries.
 * Re-reads whenever the search changes, so clicking a second notification
 * while already on the page re-triggers the focus flow.
 */
export function usePageFocus(): PageFocus | null {
  const location = useLocation();
  return parseFocusTarget(location.search);
}

/**
 * Scrolls a focused live row into view and temporarily highlights it.
 *
 * - `ready` gates the flow until the page data has loaded.
 * - `ensureVisible` (optional) runs first so callers can relax filters/search
 *   that would otherwise hide the target row (e.g. switching the type/status
 *   filter to "all").
 * - The highlight is a one-shot CSS animation — it never blocks the row's
 *   buttons and is safe on mobile.
 * - After the focus operation the `?focus=&id=` params are stripped from the
 *   URL through TanStack navigation (`resetScroll: false`) so the page does
 *   NOT snap back to the top.
 */
export function useFocusHighlight(opts: {
  focus: PageFocus | null;
  ready?: boolean;
  ensureVisible?: (focus: PageFocus) => void;
}): void {
  const { focus, ready = true, ensureVisible } = opts;
  const ensureVisibleRef = useRef(ensureVisible);
  ensureVisibleRef.current = ensureVisible;
  const router = useRouter();

  // Timers live in a ref ON PURPOSE: the URL-strip navigation clears
  // `location.search`, which turns `focusKey` null and re-runs this effect —
  // effect-local timer variables would be wiped by that exact moment. The
  // guard must outlive the strip re-render so it can undo any scroll reset
  // the router (or Radix focus-return) fires during/after it.
  const timersRef = useRef<{ retry?: number; strip?: number; guard?: number }>({});
  const highlightActiveRef = useRef(false);

  const focusKey = focus ? `${focus.focus}:${focus.id}` : null;

  // Unmount-only cleanup (deps []): when the PAGE goes away, stop everything —
  // in particular the strip timer must never fire a router.navigate after the
  // component is gone (it would rewrite the NEXT page's URL).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      if (timers.retry) window.clearTimeout(timers.retry);
      if (timers.strip) window.clearTimeout(timers.strip);
      if (timers.guard) window.clearTimeout(timers.guard);
    };
  }, []);

  useEffect(() => {
    if (!focusKey || !ready) return;
    const splitAt = focusKey.indexOf(":");
    const id = focusKey.slice(splitAt + 1);

    ensureVisibleRef.current?.({ focus: focusKey.slice(0, splitAt) as PageFocus["focus"], id });

    const timers = timersRef.current;
    // A re-run (second notification click while a previous flow is still
    // winding down) supersedes the previous flow's timers entirely.
    if (timers.retry) window.clearTimeout(timers.retry);
    if (timers.strip) window.clearTimeout(timers.strip);
    if (timers.guard) window.clearTimeout(timers.guard);
    timers.retry = undefined;
    timers.strip = undefined;
    timers.guard = undefined;

    const findStart = performance.now();

    const clearQuery = () => {
      try {
        if (!window.location.search) return;
        // Strip the focus params through the router so the URL change is a
        // real navigation that `useLocation()` observes. `resetScroll: false`
        // stops TanStack from scrolling the page back to the top, which would
        // yank the just-revealed row out of the viewport.
        void router.navigate({
          to: window.location.pathname,
          search: {},
          replace: true,
          resetScroll: false,
        } as never);
      } catch {
        // Last resort: raw History API, non-fatal and inert.
        try {
          history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
        } catch {
          /* ignore */
        }
      }
    };

    const findRow = () => document.querySelector<HTMLElement>(`[${FOCUS_ATTRIBUTE}="${id}"]`);
    /** True when any part of the row is within the visible viewport. */
    const intersectsViewport = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      return r.top < vh && r.bottom > 0;
    };

    /** True when the row is well-placed within the safe zone (middle 70%). */
    const isInSafeZone = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      const safeTop = vh * 0.15;
      const safeBottom = vh * 0.85;
      return r.top >= safeTop && r.bottom <= safeBottom;
    };

    // Strip the ?focus=&id= params only AFTER the highlight completes.
    //
    // Ordering matters: the strip navigation re-renders the route with an
    // empty `location.search`, which turns `focusKey` null and tears this
    // effect down (clearing the guard). Deferring the strip until the
    // highlight finishes lets the 2.6s animation play out first; once the URL
    // is clean, clicking the SAME notification again produces a location
    // change and re-triggers the focus flow.
    let stripScheduled = false;
    const scheduleStrip = () => {
      if (stripScheduled) return;
      stripScheduled = true;
      timers.strip = window.setTimeout(() => {
        timers.strip = undefined;
        highlightActiveRef.current = false;
        findRow()?.classList.remove(HIGHLIGHT_CLASS);
        clearQuery();
      }, HIGHLIGHT_DURATION_MS);
    };

    // ── Guard loop ──────────────────────────────────────────────────────────
    // The previous implementation "verified" the landing on a timer that
    // SURRENDERED a few seconds after the jump. That raced against scroll
    // writers that fire LATER, and whichever landed after the surrender won —
    // yanking the page to the top right after the target had been correctly
    // reached (the reported inconsistency):
    //
    //   1. TanStack Router's scroll restoration: on every rendered navigation
    //      it resets the window scroll (onRendered → scrollTo(0,0)) unless the
    //      navigation passed `resetScroll: false`. This fires on the INITIAL
    //      focus navigation — and on slow devices its layout effect can land
    //      well after our first jump.
    //   2. Radix focus-return: closing the notification Popover (desktop) or
    //      Sheet (mobile) returns focus to the bell trigger, which sits at the
    //      TOP of the admin page. `focus()` scrolls its target into view, so
    //      this quietly scrolls the page back to the top — on mobile the sheet
    //      close animation delays it until AFTER our jump.
    //   3. React Query background refetches (15s/60s intervals, realtime
    //      invalidations) re-render the table; rows can shift at any time and
    //      push the target out of the viewport.
    //
    // Fix: don't verify for a while and stop — keep a GUARD armed for the
    // whole highlight window plus a buffer past the URL strip. Each tick
    // re-finds the row (a re-render may swap the element for a new node with
    // the same data-focus-id), keeps the highlight class on the current node
    // while the flash is active, and scrolls it back instantly whenever it
    // has drifted out of the viewport. The guard lives in refs, so it stays
    // alive ACROSS the URL-strip re-render — the LAST scroll writer in the
    // race is the guard itself, and the final resting position is always the
    // target row. It self-terminates shortly after the strip, when every
    // deep-link-related writer has already fired.
    const guardDeadline = findStart + HIGHLIGHT_DURATION_MS + GUARD_BUFFER_MS;
    const guard = () => {
      timers.guard = undefined;
      const row = findRow();
      if (row) {
        if (highlightActiveRef.current && !row.classList.contains(HIGHLIGHT_CLASS)) {
          row.classList.add(HIGHLIGHT_CLASS);
        }
        if (!isInSafeZone(row)) scrollFocusedRowIntoView(row);
      }
      if (performance.now() < guardDeadline) {
        timers.guard = window.setTimeout(guard, GUARD_TICK_MS);
      }
    };

    const perform = () => {
      const el = findRow();
      if (!el) {
        // Row not mounted yet (page data / filters still settling) — retry.
        if (performance.now() - findStart < FIND_ROW_LIMIT_MS) {
          timers.retry = window.setTimeout(perform, RETRY_DELAY_MS);
        } else {
          clearQuery(); // row genuinely missing — don't leave stale params behind
        }
        return;
      }

      highlightActiveRef.current = true;
      // Initial landing: restart the flash animation for a crisp highlight,
      // then jump. Guard corrections never restart the animation — they are
      // reactive position fixes, not new focus events.
      el.classList.remove(HIGHLIGHT_CLASS);
      void el.getBoundingClientRect();
      scrollFocusedRowIntoView(el);
      el.classList.add(HIGHLIGHT_CLASS);

      scheduleStrip();
      guard();
    };

    perform();

    return () => {
      // Normal completion (the strip set focusKey → null): the guard lives in
      // refs and must KEEP running through the strip re-render, so this
      // cleanup deliberately does nothing.
      if (!highlightActiveRef.current) return;
      // Early teardown while the highlight is still active (ready flipped,
      // superseded flow, unmount): stop this flow's timers and visuals. The
      // unmount-only effect above is the backstop that clears any leftovers.
      if (timers.retry) window.clearTimeout(timers.retry);
      if (timers.strip) window.clearTimeout(timers.strip);
      if (timers.guard) window.clearTimeout(timers.guard);
      timers.retry = undefined;
      timers.strip = undefined;
      timers.guard = undefined;
      findRow()?.classList.remove(HIGHLIGHT_CLASS);
    };
  }, [focusKey, ready, router]);
}
