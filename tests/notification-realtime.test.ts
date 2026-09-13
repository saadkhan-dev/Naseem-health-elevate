import { describe, expect, it } from "bun:test";
import {
  applyNotificationChange,
  NOTIFICATION_CACHE_LIMIT,
  type NotificationLike,
} from "../src/lib/notification-realtime";

interface Fixture extends NotificationLike {
  title: string;
  read_at: string | null;
  created_at: string;
}

const row = (id: string, extra: Partial<Fixture> = {}): Fixture => ({
  id,
  title: `Title ${id}`,
  read_at: null,
  created_at: id,
  ...extra,
});

describe("applyNotificationChange", () => {
  it("INSERT prepends (newest first, zero duplicates)", () => {
    const current = [row("3"), row("2")];
    const next = applyNotificationChange(current, { id: "1", title: "New" }, "INSERT");
    expect(next).toEqual([expect.objectContaining({ id: "1" }), row("3"), row("2")]);
    expect(next!.map((n) => n.id)).toEqual(["1", "3", "2"]);
  });

  it("INSERT with an already-cached id overlays instead of duplicating", () => {
    const current = [row("3"), row("2"), row("1")];
    const next = applyNotificationChange(current, { id: "2", title: "Updated title" }, "INSERT");
    expect(next!.filter((n) => n.id === "2").length).toBe(1);
    expect(next!.find((n) => n.id === "2")?.title).toBe("Updated title");
  });

  it("UPDATE overlays changed columns and preserves the rest", () => {
    const current = [row("3"), row("2"), row("1")];
    const next = applyNotificationChange(
      current,
      { id: "2", read_at: "2026-01-01T00:00:00Z" },
      "UPDATE",
    );
    expect(next!.find((n) => n.id === "2")).toEqual(
      expect.objectContaining({
        id: "2",
        title: "Title 2",
        read_at: "2026-01-01T00:00:00Z",
        created_at: "2",
      }),
    );
  });

  it("UPDATE for a row not in the cache prepends it", () => {
    const current = [row("2")];
    const next = applyNotificationChange(current, { id: "9", title: "Fresh" }, "UPDATE");
    expect(next!.map((n) => n.id)).toEqual(["9", "2"]);
  });

  it("DELETE removes by id only", () => {
    const current = [row("3"), row("2"), row("1")];
    const next = applyNotificationChange(current, { id: "2" }, "DELETE");
    expect(next!.map((n) => n.id)).toEqual(["3", "1"]);
  });

  it("returns undefined when there is no cache yet", () => {
    expect(applyNotificationChange(undefined, { id: "1" }, "INSERT")).toBeUndefined();
  });

  it("starts filling an empty cache", () => {
    expect(applyNotificationChange([], { id: "1" }, "INSERT")).toEqual([{ id: "1" }]);
  });

  it("caps the list at NOTIFICATION_CACHE_LIMIT entries", () => {
    const current = Array.from({ length: NOTIFICATION_CACHE_LIMIT }, (_, i) => row(String(i)));
    const next = applyNotificationChange(current, { id: "cap", title: "Overflow" }, "INSERT");
    expect(next!.length).toBe(NOTIFICATION_CACHE_LIMIT);
    expect(next![0].id).toBe("cap");
  });

  it("keeps the unread derivation correct after mark-all-read UPDATEs", () => {
    const current = [row("3"), row("2"), row("1")];
    const marked = applyNotificationChange(
      applyNotificationChange(
        applyNotificationChange(current, { id: "3", read_at: "2026-01-01T00:00:00Z" }, "UPDATE"),
        { id: "2", read_at: "2026-01-01T00:00:00Z" },
        "UPDATE",
      ),
      { id: "1", read_at: "2026-01-01T00:00:00Z" },
      "UPDATE",
    );
    expect(marked!.every((n) => n.read_at !== null)).toBe(true);
  });
});
