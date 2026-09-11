/**
 * Central site-level configuration.
 *
 * These are compile-time defaults. Every value can be toggled per-user (and is
 * persisted) via the floating-action dismiss/restore controls.
 */
export const SITE_CONFIG = {
  /**
   * Floating quick-actions dock (Book Appointment / WhatsApp / Phone /
   * Back-to-top). Set to `false` to disable it entirely on the site.
   * When enabled, visitors can still hide the dock with the × button and
   * restore it later from the "Restore" floating control.
   */
  showFloatingActions: true,
} as const;
