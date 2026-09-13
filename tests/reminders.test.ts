import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appointmentReminderEligibility,
  remindAtTimestamp,
  selectDueReminderCandidates,
  sendDueAppointmentReminders,
  REMINDER_PROCESSING_STALE_MS,
  type ReminderCandidate,
} from "../src/lib/server/reminders";
import type { NotificationEnv } from "../src/lib/notifications";

const FULL_ENV: NotificationEnv = {
  RESEND_API_KEY: "re_test",
  NOTIFICATION_FROM_EMAIL: "clinic@example.com",
  TWILIO_ACCOUNT_SID: "ACxxxxxxxx",
  TWILIO_AUTH_TOKEN: "tok",
  TWILIO_SMS_FROM: "+15005550006",
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
};

const nowMs = Date.parse("2026-09-13T20:00:00.000Z");

const futureAppointment = {
  id: "apt-1",
  appointment_no: "APT-1",
  patient_name: "Ali",
  patient_phone: "+923001234567",
  patient_email: "ali@example.com",
  date: "2026-12-01",
  time: "10:30:00",
  status: "confirmed",
  services: { name: "Physiotherapy Session" },
};

function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rm-1",
    appointment_id: "apt-1",
    channel: "email",
    remind_at: "2020-01-01T09:00:00.000Z",
    status: "scheduled",
    updated_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase client covering every operation the engine uses.
// Notification providers are stubbed (globalThis.fetch) - no real sends.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
interface FakeDb {
  reminders: Row[];
  appointments: Row[];
}

class FakeBuilder {
  private filters: Array<{ col: string; val: unknown; op: "eq" | "lte" }> = [];
  private orderCol: string | null = null;
  private limitVal: number | null = null;
  private patch: Row | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
    private op: "read" | "update" = "read",
  ) {}

  eq(col: string, val: unknown): this {
    this.filters.push({ col, val, op: "eq" });
    return this;
  }

  lte(col: string, val: unknown): this {
    this.filters.push({ col, val, op: "lte" });
    return this;
  }

  order(_col: string): this {
    this.orderCol = _col;
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  update(patch: Row): this {
    this.patch = patch;
    this.op = "update";
    return this;
  }

  select(): this {
    return this;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const rows = await this.exec();
    return { data: rows.length ? rows[0] : null, error: null };
  }

  then(
    onFulfilled?: (value: { data: Row[] | null; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    return this.exec()
      .then((rows) => ({ data: rows, error: null }))
      .then(onFulfilled, onRejected);
  }

  private async exec(): Promise<Row[]> {
    const rows = (this.db[this.table] ?? []) as Row[];
    let matched = rows.filter((row) =>
      this.filters.every((f) => {
        const value = row[f.col];
        if (f.op === "lte") return value != null && (value as string) <= (f.val as string);
        return value === f.val;
      }),
    );
    if (this.orderCol) {
      matched = [...matched].sort((a, b) => {
        const av = a[this.orderCol!] as string;
        const bv = b[this.orderCol!] as string;
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }
    if (this.limitVal != null) matched = matched.slice(0, this.limitVal);
    if (this.op === "update" && this.patch) {
      for (const row of matched) Object.assign(row, this.patch);
    }
    return matched;
  }
}

function createAdmin(db: FakeDb): SupabaseClient {
  return { from: (table: string) => new FakeBuilder(db, table) } as unknown as SupabaseClient;
}

async function recordFetchCalls() {
  const calls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(typeof input === "string" ? input : input.url);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = origFetch;
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("remindAtTimestamp", () => {
  it("encodes clinic-local wall-clock time with the fixed +05:00 offset", () => {
    expect(remindAtTimestamp("2026-09-20", "09:30")).toBe("2026-09-20T09:30:00+05:00");
  });
});

describe("appointmentReminderEligibility", () => {
  const base = { date: "2026-12-01", time: "10:30:00" };

  it("is eligible for pending, confirmed and arrived appointments with a future slot", () => {
    for (const status of ["pending", "confirmed", "arrived"]) {
      const verdict = appointmentReminderEligibility({ ...base, status }, nowMs);
      expect(verdict.eligible, status).toBe(true);
    }
  });

  it("is ineligible for cancelled, rejected, completed and no_show appointments", () => {
    for (const status of ["cancelled", "rejected", "completed", "no_show"]) {
      const verdict = appointmentReminderEligibility({ ...base, status }, nowMs);
      expect(verdict.eligible, status).toBe(false);
      expect(verdict.reason).toBe("Appointment is not active.");
    }
  });

  it("is ineligible when status is null", () => {
    const verdict = appointmentReminderEligibility({ ...base, status: null }, nowMs);
    expect(verdict.eligible).toBe(false);
  });

  it("compares the +05:00 slot time against UTC now", () => {
    // Slot 2026-09-14 00:30 PKT == 2026-09-13T19:30:00Z.
    const appt = { date: "2026-09-14", time: "00:30:00", status: "confirmed" };
    expect(
      appointmentReminderEligibility(appt, Date.parse("2026-09-13T20:00:00.000Z")).eligible,
    ).toBe(false);
    expect(
      appointmentReminderEligibility(appt, Date.parse("2026-09-13T19:00:00.000Z")).eligible,
    ).toBe(true);
  });

  it("relies on status alone when the appointment has no time (flexible slot)", () => {
    expect(
      appointmentReminderEligibility({ ...base, time: null, status: "confirmed" }, nowMs).eligible,
    ).toBe(true);
    expect(
      appointmentReminderEligibility({ ...base, time: null, status: "completed" }, nowMs).eligible,
    ).toBe(false);
  });

  it("treats a malformed slot as eligible so delivery is still attempted", () => {
    expect(
      appointmentReminderEligibility({ ...base, time: "never", status: "confirmed" }, nowMs)
        .eligible,
    ).toBe(true);
  });
});

describe("selectDueReminderCandidates", () => {
  const c = (id: string, remind_at: string): ReminderCandidate => ({
    id,
    appointment_id: "apt-1",
    channel: "email",
    remind_at,
  });

  it("merges fresh and stale candidates ordered by earliest reminder time", () => {
    const fresh = [c("a", "2026-12-01T09:00:00.000Z"), c("c", "2026-12-01T11:00:00.000Z")];
    const stale = [c("b", "2026-12-01T10:00:00.000Z")];
    expect(selectDueReminderCandidates(fresh, stale, 10).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("caps the batch at the limit", () => {
    const fresh = [c("a", "2026-12-01T09:00:00.000Z"), c("c", "2026-12-01T11:00:00.000Z")];
    const stale = [c("b", "2026-12-01T10:00:00.000Z")];
    expect(selectDueReminderCandidates(fresh, stale, 2)).toHaveLength(2);
  });

  it("returns an empty list when nothing is due", () => {
    expect(selectDueReminderCandidates([], [], 50)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Engine behavior (fake admin, stubbed providers - no real sends)
// ---------------------------------------------------------------------------

describe("sendDueAppointmentReminders", () => {
  it("sends each due reminder once, marks it sent, and sends nothing on a second run", async () => {
    const db: FakeDb = {
      reminders: [reminderRow()],
      appointments: [{ ...futureAppointment }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const first = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(first).toEqual({ processed: 1, sent: 1, failed: 0 });
      expect(db.reminders[0].status).toBe("sent");
      expect(db.reminders[0].sent_at).toBeTruthy();
      expect(db.reminders[0].updated_at).toBeTruthy();
      expect(stub.calls.some((u) => u.includes("api.resend.com"))).toBe(true);

      const second = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(second).toEqual({ processed: 0, sent: 0, failed: 0 });
      expect(db.reminders[0].status).toBe("sent");
    } finally {
      stub.restore();
    }
  });

  it("cancels reminders whose appointment is not active and never sends", async () => {
    const db: FakeDb = {
      reminders: [reminderRow()],
      appointments: [{ ...futureAppointment, status: "cancelled" }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const result = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(result).toEqual({ processed: 1, sent: 0, failed: 0 });
      expect(db.reminders[0].status).toBe("cancelled");
      expect(String(db.reminders[0].error)).toContain("not active");
      expect(stub.calls).toHaveLength(0);
    } finally {
      stub.restore();
    }
  });

  it("cancels reminders whose clinic-local appointment time has already passed", async () => {
    const db: FakeDb = {
      reminders: [reminderRow()],
      appointments: [
        { ...futureAppointment, date: "2026-01-02", time: "10:30:00", status: "confirmed" },
      ],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const result = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(result).toEqual({ processed: 1, sent: 0, failed: 0 });
      expect(db.reminders[0].status).toBe("cancelled");
      expect(String(db.reminders[0].error)).toContain("already passed");
      expect(stub.calls).toHaveLength(0);
    } finally {
      stub.restore();
    }
  });

  it("marks a reminder failed when no channel can be delivered (unconfigured env)", async () => {
    const db: FakeDb = {
      reminders: [reminderRow()],
      appointments: [{ ...futureAppointment }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const result = await sendDueAppointmentReminders(admin, {});
      expect(result).toEqual({ processed: 1, sent: 0, failed: 1 });
      expect(db.reminders[0].status).toBe("failed");
      expect(String(db.reminders[0].error)).toContain("Missing:");
      expect(stub.calls).toHaveLength(0);
    } finally {
      stub.restore();
    }
  });

  it("does not reclaim a fresh processing row (no double send during overlap)", async () => {
    const db: FakeDb = {
      reminders: [
        reminderRow({
          status: "processing",
          updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        }),
      ],
      appointments: [{ ...futureAppointment }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const result = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(result).toEqual({ processed: 0, sent: 0, failed: 0 });
      expect(db.reminders[0].status).toBe("processing");
      expect(stub.calls).toHaveLength(0);
    } finally {
      stub.restore();
    }
  });

  it("reclaims and sends a stale processing row (crash recovery)", async () => {
    const db: FakeDb = {
      reminders: [
        reminderRow({
          status: "processing",
          updated_at: new Date(
            Date.now() - (REMINDER_PROCESSING_STALE_MS + 5 * 60 * 1000),
          ).toISOString(),
        }),
      ],
      appointments: [{ ...futureAppointment }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const result = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(result).toEqual({ processed: 1, sent: 1, failed: 0 });
      expect(db.reminders[0].status).toBe("sent");
      expect(stub.calls.some((u) => u.includes("api.resend.com"))).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it("ignores reminders that are not due yet", async () => {
    const db: FakeDb = {
      reminders: [reminderRow({ remind_at: "2099-01-01T00:00:00.000Z" })],
      appointments: [{ ...futureAppointment }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      const result = await sendDueAppointmentReminders(admin, FULL_ENV);
      expect(result).toEqual({ processed: 0, sent: 0, failed: 0 });
      expect(db.reminders[0].status).toBe("scheduled");
      expect(stub.calls).toHaveLength(0);
    } finally {
      stub.restore();
    }
  });

  it("stamps the same updated_at across claim and final update within a run", async () => {
    const db: FakeDb = {
      reminders: [reminderRow()],
      appointments: [{ ...futureAppointment }],
    };
    const admin = createAdmin(db);
    const stub = await recordFetchCalls();
    try {
      await sendDueAppointmentReminders(admin, FULL_ENV);
      const finished = db.reminders[0];
      expect(String(finished.updated_at)).toBe(String(finished.sent_at));
    } finally {
      stub.restore();
    }
  });
});
