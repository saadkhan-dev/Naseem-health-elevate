import { useEffect, useState } from "react";

/**
 * Content- and footer-aware clearance for the floating WhatsApp / AI assistant
 * controls.
 *
 * Floating controls are anchored to the viewport's bottom-right corner. This
 * hook computes how many pixels they must be raised so that they:
 *   1. never cover the page footer (e.g. the clinic timings box), and
 *   2. never cover interactive page content (buttons, links, form fields,
 *      action rows inside cards) that happens to be in that corner.
 *
 * Returns `{ clearance, hidden }`:
 *   - `clearance`: the px offset to add on top of the control's normal
 *     `bottom` position. It is the LARGER of the footer clearance and the
 *     content-collision offset, so the controls always float above whatever is
 *     currently at the bottom-right of the viewport.
 *   - `hidden`: true when even a large offset cannot place the controls in a
 *     free spot (e.g. a tall form/card fills the whole corner). Consumers
 *     should fade the controls out (pointer-events: none) so they never block
 *     page content — they reappear as soon as space frees up.
 *
 * The `[data-floating-control]` attribute marks the floating controls
 * themselves so they are excluded from the collision scan.
 */
export function useFooterClearance(): { clearance: number; hidden: boolean } {
  const [state, setState] = useState({ clearance: 0, hidden: false });

  useEffect(() => {
    function compute() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 1. Footer clearance — raise above the footer whenever it is on screen.
      let footerClearance = 0;
      const footer = document.querySelector("footer");
      if (footer) {
        const top = footer.getBoundingClientRect().top;
        // Only while the footer's top is visible. If the footer is taller than
        // the viewport (its top above the fold) we keep the normal position so
        // the controls never get pushed off-screen.
        if (top >= 0 && top < vh) {
          footerClearance = Math.max(0, vh - top);
        }
      }

      // 2. Content collision — raise above any interactive element that sits in
      // the bottom-right corner region the controls occupy.
      const zoneRight = vw - 4;
      const zoneLeft = Math.max(0, vw - Math.min(260, vw - 24));
      const zoneTop = vh - 220;
      let contentClearance = 0;
      const els = document.querySelectorAll(
        'button, a[href], input, textarea, select, [role="button"], [contenteditable="true"]',
      );
      for (const el of els) {
        // Skip the floating controls themselves and anything inside them (the
        // open chat window, its action chips, etc.).
        if (el.closest("[data-floating-control]")) continue;
        if (el.closest("footer")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // Ignore controls that are entirely off-screen vertically.
        if (r.bottom <= 0 || r.top >= vh) continue;
        // Only care about the bottom-right corner band.
        if (r.bottom <= zoneTop) continue;
        if (r.right <= zoneLeft || r.left >= zoneRight) continue;
        // Raise just enough to clear the top of this element.
        const need = vh - r.top + 12;
        if (need > contentClearance) contentClearance = need;
      }

      const clearance = Math.max(footerClearance, contentClearance);

      // 3. If the required raise would push the controls into the upper part of
      // the viewport (above a sensible safe area), fade them out instead of
      // floating them awkwardly mid-screen.
      const safeRaise = Math.max(0, vh - 180 - 64);
      const hidden = clearance > safeRaise;

      setState({ clearance: hidden ? 0 : clearance, hidden });
    }

    compute();
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", compute);
    const observer = new ResizeObserver(onScroll);
    const footer = document.querySelector("footer");
    if (footer) observer.observe(footer);
    // Recompute when content is added/removed (cards, action rows, forms that
    // render after data loads) so the floating controls never sit on top of it.
    const mutationObserver = new MutationObserver(onScroll);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", compute);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return state;
}
