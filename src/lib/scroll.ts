/**
 * Independent section scrolling for the sticky navbar.
 *
 * Each section has its own gap value.
 * Changing one section does NOT affect any other section.
 */

const FALLBACK_NAVBAR_REM = 4;
const RETRY_LIMIT = 30;
const RETRY_DELAY_MS = 100;
const SLACK_PX = 2;
const SETTLE_MS = 650;
const CORRECTIONS_LIMIT = 2;

const CORRECTION_DELAY_MS = 700;
const CORRECTION_LIMIT = 2;

const POSITION_TOLERANCE = 3;

/* =========================================================
   SECTION GAPS
   =========================================================
   Change ONLY the numbers below.

   Example:
   return 20 = 20px gap below navbar

   Every section is completely independent.
   ========================================================= */

function getSectionGap(id: string): number {
  switch (id) {
    // HOME
    // Keep Home unchanged (scrolls to top = first-load look).
    case "home":
      return 0;

    // ABOUT
    case "about":
      return 40;

    // SERVICES
    case "services":
      return 50;

    // PRODUCTS
    case "products":
      return 41;

    // VIDEOS
    case "videos":
      return 100;

    // CONTACT
    case "contact":
      return 40;

    // REVIEWS
    case "reviews":
      return 0;

    // OTHER SECTIONS
    case "diseases":
      return 12;

    case "booking":
      return 0;

    case "video-consultation":
      return 12;

    default:
      return 12;
  }
}

/* =========================================================
   ROOT FONT SIZE
   ========================================================= */

function rootRemPx(): number {
  if (typeof document === "undefined") {
    return 16;
  }

  const root = getComputedStyle(document.documentElement);

  return parseFloat(root.fontSize) || 16;
}

/* =========================================================
   NAVBAR HEIGHT
   ========================================================= */

function navbarHeightPx(): number {
  if (typeof document === "undefined") {
    return FALLBACK_NAVBAR_REM * rootRemPx();
  }

  const header = document.querySelector<HTMLElement>("header.sticky");

  if (header && header.offsetHeight > 0) {
    return header.offsetHeight;
  }

  const root = getComputedStyle(document.documentElement);

  const navbarRem = parseFloat(root.getPropertyValue("--navbar-height")) || FALLBACK_NAVBAR_REM;

  return navbarRem * rootRemPx();
}

/* =========================================================
   FIND ACTUAL HEADING
   ========================================================= */

function getScrollTarget(el: HTMLElement, id?: string): HTMLElement {
  // Booking section: scroll to the section itself, not its heading.
  // This keeps the booking heading completely below the sticky navbar.
  if (id === "booking") {
    return el;
  }

  const heading = el.querySelector<HTMLElement>("h1, h2, h3");
  return heading ?? el;
}

/* =========================================================
   CALCULATE TARGET POSITION
   ========================================================= */

function getTargetTop(el: HTMLElement, id: string): number {
  if (id === "home") {
    return 0;
  }

  const target = getScrollTarget(el, id);

  const navbarHeight = navbarHeightPx();

  const sectionGap = getSectionGap(id);

  return target.getBoundingClientRect().top + window.scrollY - navbarHeight - sectionGap;
}

/* =========================================================
   SCROLL TO AN ELEMENT (success sections)
   ========================================================= */

/**
 * Scroll a specific element into view below the sticky navbar.
 * `gapPx` is an extra breathing room above the element (defaults to the
 * generic section gap). Used by the "auto-scroll after success" flow — it
 * never touches the URL or history, so browser back/forward is preserved and
 * it can't conflict with the notification deep-link focus.
 */
export function scrollToElement(el: HTMLElement, gapPx?: number, correction = 2): void {
  const target = el.getBoundingClientRect().top + window.scrollY - navbarHeightPx();

  const gap = typeof gapPx === "number" ? gapPx : getSectionGap("default");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const go = () => {
    window.scrollTo({
      top: Math.max(target - gap, 0),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  go();

  // Re-check once after the page settles (images/fonts can shift layout) and
  // correct ONLY if the target genuinely left the viewport — never if the user
  // scrolled away themselves (the element is still partly visible then).
  window.setTimeout(() => {
    if (correction <= 0) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 720;
    const outside = rect.bottom < 0 || rect.top > vh;
    if (outside) go();
  }, 450);
}

/* =========================================================
   CHECK POSITION
   ========================================================= */

function isPositionCorrect(el: HTMLElement, id: string): boolean {
  const expected = getTargetTop(el, id);

  return Math.abs(window.scrollY - expected) <= POSITION_TOLERANCE;
}

/* =========================================================
   CORRECT LATE LAYOUT SHIFT
   ========================================================= */

function correctPosition(el: HTMLElement, id: string, remaining: number) {
  if (remaining <= 0) {
    return;
  }

  if (isPositionCorrect(el, id)) {
    return;
  }

  const target = getTargetTop(el, id);

  window.scrollTo({
    top: Math.max(target, 0),
    behavior: "smooth",
  });

  window.setTimeout(() => {
    correctPosition(el, id, remaining - 1);
  }, CORRECTION_DELAY_MS);
}

/* =========================================================
   MAIN SCROLL FUNCTION
   ========================================================= */

export function scrollToHash(hash: string) {
  const id = hash.replace(/^#/, "");

  if (!id) {
    return;
  }

  let attempt = 0;

  const performScroll = () => {
    const section = document.getElementById(id) as HTMLElement | null;

    /* -----------------------------------------------------
       Section does not exist yet.
       Retry while the page is still loading.
       ----------------------------------------------------- */

    if (!section) {
      if (attempt < RETRY_LIMIT) {
        attempt += 1;

        window.setTimeout(performScroll, RETRY_DELAY_MS);
      }

      return;
    }

    /* -----------------------------------------------------
       Calculate exact position using THIS section's
       independent gap.
       ----------------------------------------------------- */

    const target = getTargetTop(section, id);

    /* -----------------------------------------------------
       Scroll
       ----------------------------------------------------- */

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: Math.max(target, 0),
      behavior: reducedMotion ? "auto" : "smooth",
    });

    /* -----------------------------------------------------
       Correct possible layout shifts caused by:
       services/products/videos/reviews loading etc.
       ----------------------------------------------------- */

    window.setTimeout(() => {
      correctPosition(section, id, CORRECTION_LIMIT);
    }, CORRECTION_DELAY_MS);

    /* -----------------------------------------------------
       Update URL without triggering native browser
       hash scrolling.
       ----------------------------------------------------- */

    try {
      history.replaceState(null, "", `#${id}`);
    } catch {
      // Ignore history errors.
    }
  };

  performScroll();
}
