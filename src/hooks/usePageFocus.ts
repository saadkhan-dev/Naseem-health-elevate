import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { parseFocusTarget, type PageFocus } from "@/lib/admin-focus";

const HIGHLIGHT_CLASS = "focus-flash";
const HIGHLIGHT_DURATION_MS = 2600;
const FOCUS_ATTRIBUTE = "data-focus-id";
const MAX_RETRIES = 25;
const RETRY_DELAY_MS = 120;

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
 */
function scrollFocusedRowIntoView(el: HTMLElement) {
  const htmlEl = document.documentElement;
  const prevScrollBehavior = htmlEl.style.scrollBehavior;
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
    window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      const outside = rect.bottom < 0 || rect.top > vh || rect.top < 0 || rect.bottom > vh;
      if (outside) jumpTo();
      htmlEl.style.scrollBehavior = prevScrollBehavior;
    }, 130);
  } catch {
    htmlEl.style.scrollBehavior = prevScrollBehavior;
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

  const focusKey = focus ? `${focus.focus}:${focus.id}` : null;

  useEffect(() => {
    if (!focusKey || !ready) return;
    const splitAt = focusKey.indexOf(":");
    const id = focusKey.slice(splitAt + 1);

    ensureVisibleRef.current?.({ focus: focusKey.slice(0, splitAt) as PageFocus["focus"], id });

    let attempt = 0;
    let finished = false;
    let retryTimer: number | undefined;
    let stripTimer: number | undefined;

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

    /** True when any part of the row is currently within the viewport. */
    const intersectsViewport = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      return r.top < vh && r.bottom > 0;
    };

    const jumpAndFlash = (el: HTMLElement) => {
      // Restart the animation on repeat corrections so a re-scrolled row still
      // carries a visible highlight.
      el.classList.remove(HIGHLIGHT_CLASS);
      void el.getBoundingClientRect();
      scrollFocusedRowIntoView(el);
      el.classList.add(HIGHLIGHT_CLASS);
    };

    // Strip the ?focus=&id= params only AFTER the highlight completes.
    //
    // Ordering matters: passing a fresh search through the router (or a raw
    // `history.replaceState`) makes the router re-render with an empty
    // `location.search`, which re-runs this effect's cleanup — killing any
    // pending correction timers and removing the just-added highlight class.
    // The strip is therefore scheduled only once the row has actually landed
    // in the viewport; until then the verify loop below keeps correcting.
    // Deferring the strip lets the 2.6s animation finish first; once the URL
    // is clean, clicking the SAME notification again produces a location
    // change and re-triggers the focus flow.
    let stripScheduled = false;
    const scheduleStrip = (el: HTMLElement | null) => {
      if (stripScheduled) return;
      stripScheduled = true;
      stripTimer = window.setTimeout(() => {
        el?.classList.remove(HIGHLIGHT_CLASS);
        clearQuery();
      }, HIGHLIGHT_DURATION_MS);
    };

    const perform = () => {
      const el = findRow();
      if (!el) {
        if (attempt < MAX_RETRIES) {
          attempt += 1;
          retryTimer = window.setTimeout(perform, RETRY_DELAY_MS);
        } else {
          clearQuery(); // row genuinely missing — don't leave stale params behind
        }
        return;
      }

      finished = true;
      jumpAndFlash(el);

      // Filters/search the caller resets in `ensureVisible` are async: the row
      // list re-renders AFTER the first jump, which can land the row off-screen
      // again. Keep correcting until the row is actually visible (or give up a
      // few seconds later) instead of assuming the single jump was enough.
      const verifyStart = performance.now();
      const verifyLimit = HIGHLIGHT_DURATION_MS + 2000;
      // Row must land AND stay put. TanStack's scroll restoration fires a beat
      // after navigation (`window.scrollTo(0)`), which would otherwise reset
      // the just-made jump. Only strip once the row has been visibly centred
      // across a few consecutive correction ticks, so a later restoration can't
      // strand it offscreen for the rest of the highlight.
      let stableTicks = 0;
      const verify = () => {
        const row = findRow();
        if (row && intersectsViewport(row)) {
          stableTicks += 1;
          if (stableTicks >= 3) {
            scheduleStrip(row);
            return;
          }
        } else {
          stableTicks = 0;
          if (row) jumpAndFlash(row);
        }
        if (performance.now() - verifyStart < verifyLimit) {
          retryTimer = window.setTimeout(verify, RETRY_DELAY_MS);
        } else {
          scheduleStrip(row);
        }
      };
      retryTimer = window.setTimeout(verify, 130);
    };

    perform();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      if (stripTimer) window.clearTimeout(stripTimer);
      if (finished) {
        const el = findRow();
        el?.classList.remove(HIGHLIGHT_CLASS);
      }
    };
  }, [focusKey, ready, router]);
}
