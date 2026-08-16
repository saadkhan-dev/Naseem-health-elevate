import { useLocation } from "@tanstack/react-router";

/**
 * Centralized, route-aware visibility for the floating WhatsApp / Naseem AI
 * assistant controls.
 *
 * The controls are shown on the public website (homepage and normal landing
 * sections) and hidden on functional/application pages where the user is
 * performing an important focused task and floating buttons would cover the
 * interface — user dashboard, video consultation / call, checkout, cart and
 * other application workflows.
 *
 * Visibility depends ONLY on the current route — never on scroll position —
 * so the buttons stay available while scrolling through public pages.
 *
 * Returns `{ hidden }`:
 *   - `hidden`: true when the current route is an application page, false on
 *     public pages. Consumers fade the controls out (pointer-events: none).
 */
const HIDDEN_ROUTE_PREFIXES = [
  "/admin",
  "/patient",
  "/video",
  "/cart",
  "/checkout",
  "/reset-password",
];

function isFocusedAppRoute(pathname: string): boolean {
  return HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function useFloatingControls(): { hidden: boolean } {
  const location = useLocation();
  return { hidden: isFocusedAppRoute(location.pathname) };
}
