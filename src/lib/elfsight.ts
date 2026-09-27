/**
 * Elfsight platform loader.
 *
 * Elfsight widgets are installed with a two-part snippet:
 *
 *   <script src="https://elfsightcdn.com/platform.js" async></script>
 *   <div class="elfsight-app-<APP_ID>" data-elfsight-app-lazy></div>
 *
 * `platform.js` is a single shared runtime for *all* Elfsight apps — it scans
 * the document for `elfsight-app-*` containers and mounts them. So it must be
 * injected exactly once per page, no matter how many widgets render or how
 * often they re-render. `loadElfsightPlatformScript` is the single place that
 * guarantees that.
 *
 * Nothing here is a secret: the app id ships in public install code and the
 * widget is designed to run in the browser. No API key is involved.
 */

/** The one shared Elfsight runtime script. */
export const ELFSIGHT_PLATFORM_SCRIPT_SRC = "https://elfsightcdn.com/platform.js";

/** Default Google Reviews widget app, from the Elfsight install snippet. */
export const ELFSIGHT_GOOGLE_REVIEWS_APP_ID = "a3761e4d-7cc8-4ff9-86c1-1cb7a5a9a777";

/** Marks our injected tag so repeat lookups are cheap and never duplicate it. */
const SCRIPT_MARKER = "data-elfsight-platform";

/** Bare app ids are alphanumeric/dashed (the default one is a UUID). */
const APP_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;
/** Also accept a pasted snippet, taking the id from the container class. */
const APP_ID_IN_CLASS = /elfsight-app-([A-Za-z0-9_-]+)/;
/** ...or from the older per-app `embed.js` URL, in case that snippet is used. */
const APP_ID_IN_SCRIPT_URL = /elfsight\.com\/p\/([A-Za-z0-9_-]+)\/embed\.js/;

/** `data-elfsight-state` values stamped onto the injected <script>. */
type ScriptState = "loading" | "ready" | "error";

/**
 * The single in-flight/settled load promise for `platform.js`. Because the key
 * is a constant, repeat callers (extra mounts, re-renders, other components)
 * all await the exact same load.
 */
let platformPromise: Promise<void> | null = null;

/**
 * Clean an Elfsight app id (or a full paste of the install snippet) down to the
 * bare id, or `null` when nothing usable was provided.
 */
export function normalizeElfsightAppId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (APP_ID_PATTERN.test(trimmed)) return trimmed;
  const fromClass = trimmed.match(APP_ID_IN_CLASS);
  if (fromClass) return fromClass[1];
  const fromScript = trimmed.match(APP_ID_IN_SCRIPT_URL);
  if (fromScript) return fromScript[1];
  return null;
}

/** The container class `platform.js` looks for when mounting an app. */
export function elfsightContainerClass(appId: string): string {
  return `elfsight-app-${appId}`;
}

function findPlatformScript(): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLScriptElement>(`script[${SCRIPT_MARKER}]`);
}

function setScriptState(script: HTMLScriptElement, state: ScriptState) {
  script.setAttribute("data-elfsight-state", state);
}

/**
 * Inject the Elfsight platform script once and resolve when it is ready.
 *
 * Safe to call from any number of components and repeated renders: the first
 * call creates the tag, every later call awaits the same promise. Rejects only
 * if the script fails to load, and a failed attempt is discarded so a later
 * call can retry.
 *
 * Never touches `document` during server rendering — it rejects there instead.
 */
export function loadElfsightPlatformScript(): Promise<void> {
  if (platformPromise) return platformPromise;

  if (typeof document === "undefined") {
    return Promise.reject(new Error("Elfsight can only load its script in the browser."));
  }

  const promise = new Promise<void>((resolve, reject) => {
    const alreadyThere = findPlatformScript();
    if (alreadyThere) {
      // Present but from a previous mount — just wait for it to finish.
      if (alreadyThere.getAttribute("data-elfsight-state") === "ready") {
        resolve();
        return;
      }
      alreadyThere.addEventListener("load", () => resolve(), { once: true });
      alreadyThere.addEventListener("error", () => reject(new Error("Elfsight script error.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = ELFSIGHT_PLATFORM_SCRIPT_SRC;
    script.async = true;
    script.setAttribute(SCRIPT_MARKER, "true");
    setScriptState(script, "loading");
    script.addEventListener(
      "load",
      () => {
        setScriptState(script, "ready");
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        setScriptState(script, "error");
        reject(new Error("Elfsight script failed to load."));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  // A failed load must not poison later attempts (e.g. offline, then online).
  platformPromise = promise.catch((err: unknown) => {
    platformPromise = null;
    throw err;
  });

  return platformPromise;
}
