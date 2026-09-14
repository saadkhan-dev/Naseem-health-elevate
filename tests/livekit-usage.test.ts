import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateParticipantMinutes } from "../src/lib/server/livekit-usage";
import { VIDEO_EVENT_RECONNECT_GRACE_MS } from "../src/lib/server/livekit";

const SESSION = "11111111-1111-4111-8111-111111111111";

function makeAdmin(
  rows: Array<Record<string, unknown>>,
  onGte?: (value: string) => void,
): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        gte: (_column: string, value: string) => {
          onGte?.(value);
          return { data: rows, error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

const ts = (iso: string): number => Date.parse(iso);

describe("estimateParticipantMinutes — milliseconds → minutes conversion", () => {
  it("679,980 ms reports ~11.33 → 11 participant-minutes, not 11,333", async () => {
    const t0 = ts("2026-09-10T12:00:00.000Z");
    const rows = [
      {
        session_id: SESSION,
        participant_role: "doctor",
        joined_at: new Date(t0).toISOString(),
        left_at: new Date(t0 + 405_000).toISOString(),
      },
      {
        session_id: SESSION,
        participant_role: "patient",
        joined_at: new Date(t0 + 500_000).toISOString(),
        left_at: new Date(t0 + 774_980).toISOString(),
      },
    ];

    const { minutes, source } = await estimateParticipantMinutes(makeAdmin(rows), {
      now: ts("2026-09-11T00:00:00.000Z"),
    });

    expect(source).toBe("app-tracked");
    expect(minutes).toBe(11); // 405_000 + 274_980 = 679,980 ms = 11.33 min
  });
});

describe("estimateParticipantMinutes — reconnect / open-leg handling", () => {
  const reconnectRows = () => [
    // Doctor: a clean, provable leg.
    {
      session_id: SESSION,
      participant_role: "doctor",
      joined_at: "2026-09-13T20:18:32.566Z",
      left_at: "2026-09-13T20:21:54.566Z", // 202,000 ms
    },
    // Patient: a reconnect created TWO open "joined" rows whose time overlaps.
    {
      session_id: SESSION,
      participant_role: "patient",
      joined_at: "2026-09-13T20:19:09.586Z",
      left_at: null,
    },
    {
      session_id: SESSION,
      participant_role: "patient",
      joined_at: "2026-09-13T20:20:55.588Z",
      left_at: null,
    },
  ];

  it("merges overlapping legs so a duplicate reconnect is not double-counted", async () => {
    const { minutes } = await estimateParticipantMinutes(makeAdmin(reconnectRows()), {
      now: ts("2026-09-14T12:00:00.000Z"),
    });

    // Naive sum would double-count the overlap:
    //   202,000 + (to now + grace for each open leg) ≈ 1,025,958 ms ≈ 17 min.
    // Merged: doctor 202,000 + patient [20:19:09.586 → anchor+grace] 464,980
    //         = 666,980 ms ≈ 11.12 min → 11 min. Overlap counted once.
    expect(minutes).toBe(11);
  });

  it("an OPEN leg stops growing at the session's last recorded leave + grace", async () => {
    const admin = makeAdmin(reconnectRows());

    // Two different render times, days apart: same estimate (plateau), not
    // minutes that keep accruing forever.
    const dayAfter = await estimateParticipantMinutes(admin, {
      now: ts("2026-09-14T12:00:00.000Z"),
    });
    const twoWeeksLater = await estimateParticipantMinutes(admin, {
      now: ts("2026-09-28T12:00:00.000Z"),
    });

    expect(dayAfter.minutes).toBe(11);
    expect(twoWeeksLater.minutes).toBe(11);
    expect(VIDEO_EVENT_RECONNECT_GRACE_MS).toBe(5 * 60_000);
  });

  it("an open leg for a session with NO closed leg at all is capped, not infinite", async () => {
    const { minutes } = await estimateParticipantMinutes(
      makeAdmin([
        {
          session_id: SESSION,
          participant_role: "patient",
          joined_at: "2026-09-05T00:00:00.000Z",
          left_at: null,
        },
      ]),
      { now: ts("2026-09-14T12:00:00.000Z") },
    );

    // Cap is VIDEO_EVENT_MAX_LEG_MS = 4 h = 240 participant-minutes.
    expect(minutes).toBe(240);
  });
});

describe("estimateParticipantMinutes — a normal 1 Doctor + 1 Patient consultation", () => {
  it("reports a realistic participant-minute estimate", async () => {
    const rows = [
      {
        session_id: SESSION,
        participant_role: "doctor",
        joined_at: "2026-09-13T20:18:32.566Z",
        left_at: "2026-09-13T20:21:54.566Z", // 202,000 ms
      },
      {
        session_id: SESSION,
        participant_role: "patient",
        joined_at: "2026-09-13T20:19:09.586Z",
        left_at: "2026-09-13T20:21:54.566Z", // 164,980 ms
      },
    ];

    const { minutes } = await estimateParticipantMinutes(makeAdmin(rows), {
      now: ts("2026-09-14T12:00:00.000Z"),
    });

    // 202,000 + 164,980 = 366,980 ms ≈ 6.1 participant-minutes.
    expect(minutes).toBe(6);
  });
});

describe("estimateParticipantMinutes — calendar-month scoping", () => {
  it("filters by the month that contains the snapshot time", async () => {
    let filter = "";
    await estimateParticipantMinutes(
      makeAdmin([], (value) => {
        filter = value;
      }),
      { now: ts("2026-09-14T12:00:00.000Z") },
    );

    expect(filter).toBe("2026-09-01T00:00:00.000Z");
  });
});
