/**
 * Server-only Google Meet integration.
 *
 * Creates a Google Meet meeting space with the Meet REST API and caches the
 * short-lived OAuth access token. The only thing ever persisted is the
 * returned `meetingUri` (and the internal `space name`) — the credentials are
 * read from server-only env vars and NEVER shipped to the browser:
 *
 *   GOOGLE_MEET_CLIENT_ID       (OAuth 2.0 Client ID, web application)
 *   GOOGLE_MEET_CLIENT_SECRET   (matching client secret)
 *   GOOGLE_MEET_REFRESH_TOKEN   (one-time OAuth consent, see README)
 *
 * The Google Meet API only works for Google Workspace accounts — the app must
 * authenticate as a Workspace user (refresh-token flow), NOT an API key and
 * NOT a personal gmail account.
 *
 * Endpoints:
 *   token  -> POST https://oauth2.googleapis.com/token   (refresh_token grant)
 *   spaces -> POST https://meet.googleapis.com/v2/spaces (create a space)
 * Scope   -> https://www.googleapis.com/auth/meetings.space.created
 */

/** OAuth scope required to create (and manage) meeting spaces. */
export const GOOGLE_MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";

/** Endpoint that exchanges / refreshes OAuth tokens. */
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Google Meet REST API (v2) endpoint that creates a meeting space. */
const GOOGLE_MEET_API_ENDPOINT = "https://meet.googleapis.com/v2/spaces";

/** Access tokens live for 1h; refresh 5 minutes early to stay safe. */
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Refresh token obtained at the one-time OAuth callback (`/oauth-code`). Kept
 * in memory so the running server can mint access tokens immediately; in local
 * dev it is ALSO written to `.env` (gitignored) so it survives restarts. The
 * value is never returned to the browser.
 */
let overriddenRefreshToken: string | null = null;

/** Raised when the server Google env vars are missing or the consent expired. */
export class GoogleMeetNotConfiguredError extends Error {
  constructor(missing: string[]) {
    const list = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
    super(
      "Google Meet is not configured for the clinic yet." +
        list +
        " Add the Google Meet server variables and run the one-time OAuth consent (see README → Google Meet setup).",
    );
    this.name = "GoogleMeetNotConfiguredError";
  }
}

/** Raised when the Google Meet API rejects a request (auth or API side). */
export class GoogleMeetApiError extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(status: number, detail: string) {
    super(`Google Meet API error (HTTP ${status}): ${detail}`);
    this.name = "GoogleMeetApiError";
    this.status = status;
    this.detail = detail;
  }
}

export interface GoogleMeetConfig {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  configured: boolean;
  /** Names of the env vars that are missing. */
  missing: string[];
}

/** Read a server env var from process.env (Node) or import.meta.env (Vite/Workers). */
function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[name];
    if (value) return value;
  }
  try {
    const viteEnv = import.meta.env as Record<string, string | undefined>;
    return viteEnv[name];
  } catch {
    return undefined;
  }
}

/** All Google Meet env vars + whether the integration can be used. */
export function getGoogleMeetConfig(): GoogleMeetConfig {
  const clientId = readEnv("GOOGLE_MEET_CLIENT_ID") ?? null;
  const clientSecret = readEnv("GOOGLE_MEET_CLIENT_SECRET") ?? null;
  const refreshToken = overriddenRefreshToken ?? readEnv("GOOGLE_MEET_REFRESH_TOKEN") ?? null;

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_MEET_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_MEET_CLIENT_SECRET");
  if (!refreshToken) missing.push("GOOGLE_MEET_REFRESH_TOKEN");

  return {
    clientId,
    clientSecret,
    refreshToken,
    configured: missing.length === 0,
    missing,
  };
}

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;

/**
 * Obtain a fresh Google access token from the refresh token (cached for ~1h).
 * Throws `GoogleMeetNotConfiguredError` when env credentials are missing.
 */
export async function getGoogleMeetAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry - ACCESS_TOKEN_REFRESH_BUFFER_MS) {
    return cachedAccessToken;
  }

  const config = getGoogleMeetConfig();
  if (!config.configured || !config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new GoogleMeetNotConfiguredError(config.missing);
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleMeetApiError(
      res.status,
      `Token refresh failed: ${body.slice(0, 300) || res.statusText}`,
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new GoogleMeetApiError(res.status, "Token refresh returned no access token.");
  }

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiry = Date.now() + ttlMs;
  return data.access_token;
}

export interface GoogleMeetSpace {
  /** Resource name of the space, e.g. "spaces/jQCFfuBOdN5z". */
  name: string;
  /** e.g. "https://meet.google.com/abc-mnop-xyz" */
  meetingUri: string;
  /** e.g. "abc-mnop-xyz" */
  meetingCode: string;
}

/**
 * Create a single Google Meet meeting space on behalf of the clinic's
 * Workspace account and return the join URI + space id. Creating the same
 * space twice is impossible by design — callers must reuse a stored `meet_url`
 * (see `createOrReuseVideoSession`).
 *
 * The request body is intentionally empty: Meet auto-generates the code/URI.
 */
export async function createGoogleMeetSpace(): Promise<GoogleMeetSpace> {
  const accessToken = await getGoogleMeetAccessToken();

  const res = await fetch(GOOGLE_MEET_API_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleMeetApiError(res.status, body.slice(0, 500) || res.statusText);
  }

  const data = (await res.json()) as {
    name?: string;
    meetingUri?: string;
    meetingCode?: string;
  };

  if (!data.name || !data.meetingUri) {
    throw new GoogleMeetApiError(200, "Google Meet returned an incomplete space payload.");
  }

  return {
    name: data.name,
    meetingUri: data.meetingUri,
    meetingCode: data.meetingCode ?? "",
  };
}

/**
 * Build the one-time OAuth consent URL. A clinic admin opens this in a browser
 * (signed in as the Workspace account), approves, and the resulting
 * authorization code is exchanged for a refresh token (see README). Required
 * because the Google Meet API needs user context — API keys cannot create
 * meeting spaces.
 */
export function googleMeetConsentUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_MEET_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange a one-time authorization code for tokens. The returned refresh
 * token is what must be stored in `GOOGLE_MEET_REFRESH_TOKEN` (server-only).
 * This runs from a one-time setup script / curl — never from the browser.
 */
export async function exchangeGoogleMeetCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleMeetApiError(res.status, `Code exchange failed: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new GoogleMeetApiError(res.status, "Code exchange returned no tokens.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresIn: data.expires_in ?? 3600,
  };
}

/**
 * Persist the Google Meet refresh token obtained at the `/oauth-code` callback
 * for the RUNNING server process. Callers must never send the token to the
 * browser — they receive only the status object returned here.
 *
 *  - In-memory always (so the live server can create meetings immediately).
 *  - In local dev (Vite dev server) it is ALSO written to the gitignored
 *    `.env` file so it survives restarts (Nitro re-reads `.env` on start).
 *  - In production it is only kept in memory; operators must instead add the
 *    token through the platform's secret store (e.g. `wrangler secret put`).
 *
 * Real tokens never touch this machine's logs or network beyond what running
 * the app already does — no token is passed back to the caller.
 */
export async function storeGoogleMeetRefreshToken(
  refreshToken: string,
): Promise<{ persisted: boolean; detail?: string }> {
  if (!refreshToken) {
    return { persisted: false, detail: "Google returned an empty refresh token." };
  }
  overriddenRefreshToken = refreshToken;

  const isDev =
    import.meta.env?.DEV === true ||
    (typeof process !== "undefined" &&
      (process.env.NODE_ENV ?? (process.env as Record<string, string | undefined>).NITRO_MODE) ===
        "development");

  if (isDev) {
    try {
      await tryPersistToEnvFile("GOOGLE_MEET_REFRESH_TOKEN", refreshToken);
      return { persisted: true };
    } catch (error) {
      return {
        persisted: false,
        detail: `Could not write .env (${error instanceof Error ? error.message : "write failed"}). The token is active for this server session only.`,
      };
    }
  }

  return {
    persisted: false,
    detail:
      "Production: the token is active for this server session. Persist it with your platform's secret store (e.g. wrangler secret put).",
  };
}

/**
 * Safely rewrite the `GOOGLE_MEET_REFRESH_TOKEN=` line in `.env` (dev only).
 * Reads the whole file, edits a single line (new values are appended if no
 * active assignment exists — the commented placeholder is left untouched), and
 * swaps the file in atomically. Line endings are preserved.
 */
async function tryPersistToEnvFile(key: string, value: string): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const envPath = path.resolve(process.cwd(), ".env");

  let raw: string;
  let eol: string;
  try {
    raw = await fs.readFile(envPath, "utf8");
    eol = raw.includes("\r\n") ? "\r\n" : "\n";
  } catch {
    throw new Error(".env not found in the current working directory");
  }

  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((line) => {
    const t = line.trim();
    return !t.startsWith("#") && t.startsWith(`${key}=`);
  });

  if (idx >= 0) {
    lines[idx] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }

  const tmpPath = `${envPath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, lines.join(eol), "utf8");
  await fs.rename(tmpPath, envPath);
}
