import { describe, expect, it } from "bun:test";
import {
  ADMIN_NOTIFICATION_BODY_MAX,
  ADMIN_NOTIFICATION_DEDUP_KEY_MAX,
  ADMIN_NOTIFICATION_LINK_MAX,
  ADMIN_NOTIFICATION_TITLE_MAX,
  ADMIN_NOTIFICATION_TYPES,
  buildAdminNotificationDedupKey,
  isValidRecipientId,
  normalizeAdminNotificationInput,
} from "../src/lib/admin-notifications";

describe("normalizeAdminNotificationInput", () => {
  it("strips and truncates title/body/link/dedupKey to their length caps", () => {
    const record = normalizeAdminNotificationInput({
      title: `  ${"t".repeat(300)}  `,
      body: "b".repeat(2000),
      link: `  ${"l".repeat(1500)}  `,
      dedupKey: `  ${"d".repeat(500)}  `,
    });

    expect(record.title).toBe("t".repeat(ADMIN_NOTIFICATION_TITLE_MAX));
    expect(record.body).toBe("b".repeat(ADMIN_NOTIFICATION_BODY_MAX));
    expect(record.link).toBe("l".repeat(ADMIN_NOTIFICATION_LINK_MAX));
    expect(record.dedup_key).toBe("d".repeat(ADMIN_NOTIFICATION_DEDUP_KEY_MAX));
  });

  it("turns omitted/empty optional fields into nulls (never empty strings)", () => {
    const record = normalizeAdminNotificationInput({
      title: "Hi",
      body: "Body",
      link: "  ",
      dedupKey: "",
    });

    expect(record.recipient_id).toBeNull();
    expect(record.link).toBeNull();
    expect(record.dedup_key).toBeNull();
    expect(record.read_at).toBeNull();
  });

  it("keeps a non-null recipient_id trimmed", () => {
    const record = normalizeAdminNotificationInput({
      recipientId: "  123e4567-e89b-12d3-a456-426614174000  ",
      title: "t",
      body: "b",
    });
    expect(record.recipient_id).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("defaults unknown or empty types to general", () => {
    expect(
      normalizeAdminNotificationInput({ title: "t", body: "b", type: "not_a_type" as never }).type,
    ).toBe("general");
    expect(normalizeAdminNotificationInput({ title: "t", body: "b", type: "" as never }).type).toBe(
      "general",
    );
  });

  it("keeps every known admin notification type", () => {
    for (const type of ADMIN_NOTIFICATION_TYPES) {
      expect(normalizeAdminNotificationInput({ title: "t", body: "b", type }).type).toBe(type);
    }
  });
});

describe("buildAdminNotificationDedupKey", () => {
  it("sanitizes the type and entity id segments", () => {
    expect(buildAdminNotificationDedupKey("new appointment", "APT-ABC 123")).toBe(
      "new_appointment:APT-ABC_123",
    );
    expect(buildAdminNotificationDedupKey("new_appointment", "APT-7K4M92")).toBe(
      "new_appointment:APT-7K4M92",
    );
  });

  it("fails safe to 'general' when the type segment is empty", () => {
    expect(buildAdminNotificationDedupKey("   ", "APT-ABC123")).toBe("general:APT-ABC123");
  });

  it("caps the total length", () => {
    const key = buildAdminNotificationDedupKey("a".repeat(50), "b".repeat(300));
    expect(key.length).toBeLessThanOrEqual(ADMIN_NOTIFICATION_DEDUP_KEY_MAX);
  });
});

describe("isValidRecipientId", () => {
  it("accepts well-formed uuids", () => {
    expect(isValidRecipientId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isValidRecipientId(" 123E4567-E89B-12D3-A456-426614174000 ")).toBe(true);
  });

  it("rejects anything that is not a uuid", () => {
    expect(isValidRecipientId("")).toBe(false);
    expect(isValidRecipientId("abc")).toBe(false);
    expect(isValidRecipientId("123e4567-e89b-12d3-a456")).toBe(false);
    expect(isValidRecipientId("123e4567-e89b-12d3-a456-426614174000x")).toBe(false);
  });
});
