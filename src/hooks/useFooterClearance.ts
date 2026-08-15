import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";

/**
 * Visibility for the floating WhatsApp / AI assistant controls.
 *
 * The controls stay anchored to the viewport's bottom-right corner in their
 * normal position (clearance is always 0). They are hidden:
 *   1. whenever the page footer is on screen, so they never cover footer
 *      content, and
 *   2. on all patient dashboard pages (`/patient*`).
 *
 * Returns `{ clearance, hidden }`:
 *   - `clearance`: always 0 — the controls keep their normal `bottom` offset.
 *   - `hidden`: true when the footer is in the viewport or the user is on a
 *     patient dashboard page. Consumers fade the controls out
 *     (pointer-events: none); they reappear as soon as the footer scrolls out
 *     of view.
 */
export function useFooterClearance(): { clearance: number; hidden: boolean } {
  const location = useLocation();
  const isPatientRoute = location.pathname.startsWith("/patient");
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    function compute() {
      const footer = document.querySelector("footer");
      setFooterVisible(Boolean(footer) && footer!.getBoundingClientRect().top < window.innerHeight);
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
    window.addEventListener("resize", onScroll);
    const observer = new ResizeObserver(onScroll);
    const footer = document.querySelector("footer");
    if (footer) observer.observe(footer);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer.disconnect();
    };
  }, []);

  return { clearance: 0, hidden: isPatientRoute || footerVisible };
}
