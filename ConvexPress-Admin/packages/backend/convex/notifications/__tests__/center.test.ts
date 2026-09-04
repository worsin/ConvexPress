import { describe, expect, test } from "bun:test";

import {
  computeCounts,
  deriveNeedsAction,
  effectiveNeedsAction,
  filterForCenter,
  kindOf,
  ticketRefsFromMetadata,
  toCenterItem,
  validateSnoozeUntil,
  viewsOf,
  type CenterSourceRow,
} from "../center";
import { NOTIFICATION_TYPES } from "../validators";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

function row(overrides: Partial<CenterSourceRow> = {}): CenterSourceRow {
  return {
    _id: overrides._id ?? "n1",
    title: "Support replied",
    message: "We answered your question.",
    type: "info",
    notificationKey: "ticket_reply_agent",
    eventCode: "ticket.replied",
    persistent: true,
    createdAt: NOW - HOUR,
    ...overrides,
  };
}

describe("kindOf", () => {
  test("maps event code prefixes to customer-facing kinds", () => {
    expect(kindOf({ eventCode: "ticket.replied" })).toBe("support");
    expect(kindOf({ eventCode: "purchase.payment_failed" })).toBe("commerce");
    expect(kindOf({ eventCode: "subscription.renewed" })).toBe("commerce");
    expect(kindOf({ eventCode: "lms.course_completed" })).toBe("learning");
    expect(kindOf({ eventCode: "comment.created" })).toBe("content");
    expect(kindOf({ eventCode: "post.published" })).toBe("content");
    expect(kindOf({ eventCode: "registration.user_registered" })).toBe("account");
    expect(kindOf({ eventCode: "settings.updated" })).toBe("system");
  });

  test("falls back to the notification key, then to system", () => {
    expect(kindOf({ eventCode: "", notificationKey: "ticket_resolved" })).toBe("support");
    expect(kindOf({ eventCode: "custom.thing", notificationKey: "lms_enrolled" })).toBe("learning");
    expect(kindOf({ eventCode: "custom.thing", notificationKey: "form_submitted" })).toBe("content");
    expect(kindOf({ eventCode: "system.rate_limited", notificationKey: "post_published" })).toBe("content");
    expect(kindOf({})).toBe("system");
  });

  test("every registered notification type resolves to a non-system kind unless it is site plumbing", () => {
    const plumbing = new Set(["System", "Discovery", "Developer"]);
    for (const config of Object.values(NOTIFICATION_TYPES)) {
      const kind = kindOf({ eventCode: config.eventCode, notificationKey: config.key });
      if (plumbing.has(config.category)) continue;
      expect(kind).not.toBe("system");
    }
  });
});

describe("deriveNeedsAction", () => {
  test("uses explicit overrides first", () => {
    expect(deriveNeedsAction({ notificationKey: "ticket_reply_agent", type: "info", persistent: false })).toBe(true);
    expect(deriveNeedsAction({ notificationKey: "ticket_resolved", type: "warning", persistent: true, actionUrl: "/x" })).toBe(false);
    expect(deriveNeedsAction({ notificationKey: "password_changed", type: "warning" })).toBe(false);
  });

  test("warnings and errors need attention", () => {
    expect(deriveNeedsAction({ notificationKey: "anything", type: "error" })).toBe(true);
    expect(deriveNeedsAction({ notificationKey: "anything", type: "warning" })).toBe(true);
  });

  test("persistent notifications with a link need attention; plain info does not", () => {
    expect(deriveNeedsAction({ notificationKey: "x", type: "info", persistent: true, actionUrl: "/dashboard/orders/1" })).toBe(true);
    expect(deriveNeedsAction({ notificationKey: "x", type: "info", persistent: true })).toBe(false);
    expect(deriveNeedsAction({ notificationKey: "x", type: "success", persistent: true, actionUrl: "/courses/a" })).toBe(false);
    expect(deriveNeedsAction({ notificationKey: "x", type: "success", persistent: false, actionUrl: "/blog/a" })).toBe(false);
  });

  test("effectiveNeedsAction prefers the stored flag", () => {
    expect(effectiveNeedsAction({ notificationKey: "ticket_reply_agent", needsAction: false })).toBe(false);
    expect(effectiveNeedsAction({ notificationKey: "post_published", type: "info", needsAction: undefined })).toBe(false);
  });

  test("registry-driven derivation matches expectations for the customer-facing keys", () => {
    const expectTrue = ["ticket_reply_agent", "purchase_payment_failed", "subscription_past_due", "subscription_trial_ending", "comment_reply"];
    const expectFalse = ["purchase_created", "post_published", "lms_course_completed", "lms_certificate_issued", "ticket_resolved", "subscription_renewed"];
    for (const key of expectTrue) {
      const config = NOTIFICATION_TYPES[key as keyof typeof NOTIFICATION_TYPES];
      expect(deriveNeedsAction({ notificationKey: config.key, type: config.type, persistent: config.persistent, actionUrl: config.actionUrlTemplate })).toBe(true);
    }
    for (const key of expectFalse) {
      const config = NOTIFICATION_TYPES[key as keyof typeof NOTIFICATION_TYPES];
      expect(deriveNeedsAction({ notificationKey: config.key, type: config.type, persistent: config.persistent, actionUrl: config.actionUrlTemplate })).toBe(false);
    }
  });
});

describe("viewsOf / computeCounts", () => {
  test("classifies inbox, unread, needs, snoozed, and archived", () => {
    expect(viewsOf({ needsAction: true }, NOW)).toEqual(["inbox", "unread", "needs"]);
    expect(viewsOf({ needsAction: false, readAt: NOW - 10 }, NOW)).toEqual(["inbox"]);
    expect(viewsOf({ needsAction: true, actionedAt: NOW - 10 }, NOW)).toEqual(["inbox", "unread"]);
    expect(viewsOf({ needsAction: true, snoozedUntil: NOW + HOUR }, NOW)).toEqual(["snoozed"]);
    expect(viewsOf({ needsAction: true, dismissedAt: NOW - 10, snoozedUntil: NOW + HOUR }, NOW)).toEqual(["archived"]);
  });

  test("an expired snooze puts the row back into the inbox with no write", () => {
    const state = { needsAction: false, snoozedUntil: NOW - 1 };
    expect(viewsOf(state, NOW)).toEqual(["inbox", "unread"]);
    expect(viewsOf(state, NOW - HOUR)).toEqual(["snoozed"]);
  });

  test("counts add up per view", () => {
    const counts = computeCounts(
      [
        { needsAction: true },
        { needsAction: false, readAt: NOW },
        { needsAction: true, snoozedUntil: NOW + HOUR },
        { needsAction: false, dismissedAt: NOW },
        { needsAction: true, readAt: NOW, actionedAt: NOW },
      ],
      NOW,
    );
    expect(counts).toEqual({ inbox: 3, unread: 1, needs: 1, snoozed: 1, archived: 1 });
  });
});

describe("toCenterItem / filterForCenter", () => {
  test("projects a row to the public shape with derived kind and ticket refs", () => {
    const item = toCenterItem(
      row({
        metadata: JSON.stringify({ ticketNumber: "TKT-202609-00042", ticketId: "abc123", secret: "no" }),
        needsAction: undefined,
      }),
    );
    expect(item.id).toBe("n1");
    expect(item.kind).toBe("support");
    expect(item.needsAction).toBe(true);
    expect(item.ticketNumber).toBe("TKT-202609-00042");
    expect(item.ticketId).toBe("abc123");
    expect("metadata" in item).toBe(false);
    expect("persistent" in item).toBe(false);
  });

  test("ignores malformed metadata and ticket numbers", () => {
    expect(ticketRefsFromMetadata("{not json")).toEqual({});
    expect(ticketRefsFromMetadata(JSON.stringify({ ticketNumber: "nope" }))).toEqual({});
    expect(ticketRefsFromMetadata(undefined)).toEqual({});
  });

  test("filters by view, kind, search, and limit", () => {
    const items = [
      toCenterItem(row({ _id: "a", notificationKey: "ticket_reply_agent", eventCode: "ticket.replied", title: "Support replied" })),
      toCenterItem(row({ _id: "b", notificationKey: "purchase_created", eventCode: "purchase.created", type: "success", persistent: false, title: "Order placed", readAt: NOW })),
      toCenterItem(row({ _id: "c", notificationKey: "post_published", eventCode: "post.published", persistent: false, title: "Hello world", dismissedAt: NOW })),
      toCenterItem(row({ _id: "d", notificationKey: "lms_enrolled", eventCode: "lms.enrolled", persistent: false, title: "Enrolled", snoozedUntil: NOW + HOUR })),
    ];
    expect(filterForCenter(items, { view: "inbox" }, NOW).map((i) => i.id)).toEqual(["a", "b"]);
    expect(filterForCenter(items, { view: "unread" }, NOW).map((i) => i.id)).toEqual(["a"]);
    expect(filterForCenter(items, { view: "needs" }, NOW).map((i) => i.id)).toEqual(["a"]);
    expect(filterForCenter(items, { view: "snoozed" }, NOW).map((i) => i.id)).toEqual(["d"]);
    expect(filterForCenter(items, { view: "archived" }, NOW).map((i) => i.id)).toEqual(["c"]);
    expect(filterForCenter(items, { view: "inbox", kind: "commerce" }, NOW).map((i) => i.id)).toEqual(["b"]);
    expect(filterForCenter(items, { view: "inbox", search: "ORDER" }, NOW).map((i) => i.id)).toEqual(["b"]);
    expect(filterForCenter(items, { view: "inbox", search: "support" }, NOW).map((i) => i.id)).toEqual(["a"]);
    expect(filterForCenter(items, { view: "inbox", limit: 1 }, NOW).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("validateSnoozeUntil", () => {
  test("accepts sensible future timestamps and rejects the rest", () => {
    expect(validateSnoozeUntil(NOW + HOUR, NOW)).toBeNull();
    expect(validateSnoozeUntil(NOW + 10, NOW)).not.toBeNull();
    expect(validateSnoozeUntil(NOW - HOUR, NOW)).not.toBeNull();
    expect(validateSnoozeUntil(NOW + 31 * 24 * HOUR, NOW)).not.toBeNull();
    expect(validateSnoozeUntil(Number.NaN, NOW)).not.toBeNull();
  });
});
