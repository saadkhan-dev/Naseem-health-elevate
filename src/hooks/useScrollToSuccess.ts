import { useEffect, useRef } from "react";
import { scrollToElement } from "@/lib/scroll";

/**
 * Scroll a freshly-revealed success section into view exactly once.
 *
 * `active` should flip from false to true only AFTER the action succeeds and
 * the result section is committed to the DOM (the element the returned ref is
 * attached to). The effect:
 *
 * - skips the very first render so we never scroll on a fresh page load
 * - fires a single smooth scroll (respecting `prefers-reduced-motion`)
 * - re-checks once after layout settles and corrects a slow layout shift
 *   (limited, so it never fights other scroll writers)
 * - never touches history or the URL, so browser back/forward is preserved
 *
 * It is intentionally independent of the notification deep-link focus
 * (`usePageFocus`/`useFocusHighlight`) — those pages don't combine both.
 */
export function useScrollToSuccess<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const prevActive = useRef<boolean | null>(null);

  useEffect(() => {
    // Skip the very first commit — a fresh page load must never auto-scroll.
    if (prevActive.current === null) {
      prevActive.current = active;
      return;
    }
    if (!active) {
      if (prevActive.current) prevActive.current = false;
      return;
    }
    if (prevActive.current) return;
    prevActive.current = true;
    const el = ref.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      scrollToElement(el, 2);
    }, 40);
    return () => window.clearTimeout(id);
  }, [active]);

  return ref;
}