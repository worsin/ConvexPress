import { describe, expect, test } from "bun:test";

import {
  SNOOZE_PRESETS,
  dayLabel,
  groupByDay,
  isPendingAction,
  linkLabel,
  matchesView,
  relativeTime,
  resolveLink,
  searchText,
  summaryLine,
} from "./notifications";

const NOW = new Date(2026, 8, 4, 10, 0, 0).getTime(); // Fri Sep 4 2026, 10:00 local
const HOUR = 3_600_000;

describe("resolveLink", () => {
  test("prefers structured ticket references", () => {
    expect(resolveLink({ ticketNumber: "TKT-202609-00001", actionUrl: "/admin/tickets/x" })).toEqual({ kind: "ticket", ticketNumber: "TKT-202609-00001" });
    expect(resolveLink({ ticketId: "abc", actionUrl: "/dashboard/orders/1" })).toEqual({ kind: "ticketById", ticketId: "abc" });
  });

  test("never surfaces admin URLs to members", () => {
    expect(resolveLink({ actionUrl: "/admin/posts/1/edit" })).toBeNull();
    expect(resolveLink({ actionUrl: "/admin" })).toBeNull();
  });

  test("rewrites legacy support URLs and dashboard URLs", () => {
    expect(resolveLink({ actionUrl: "/support/tickets/k57abc" })).toEqual({ kind: "ticketById", ticketId: "k57abc" });
    expect(resolveLink({ actionUrl: "/support/tickets/tkt-202609-00002" })).toEqual({ kind: "ticket", ticketNumber: "TKT-202609-00002" });
    expect(resolveLink({ actionUrl: "/dashboard/orders/42" })).toEqual({ kind: "dashboard", subpath: "/orders/42" });
    expect(resolveLink({ actionUrl: "/dashboard" })).toEqual({ kind: "dashboard", subpath: "" });
    expect(resolveLink({ actionUrl: "/blog/hello#comment-1" })).toEqual({ kind: "path", path: "/blog/hello#comment-1" });
    expect(resolveLink({ actionUrl: "https://example.com/x" })).toEqual({ kind: "path", path: "https://example.com/x" });
    expect(resolveLink({ actionUrl: "javascript:alert(1)" })).toBeNull();
    expect(resolveLink({})).toBeNull();
  });

  test("labels", () => {
    expect(linkLabel({ kind: "ticket", ticketNumber: "x" })).toBe("Open ticket");
    expect(linkLabel({ kind: "dashboard", subpath: "/orders" }, "View Order")).toBe("View Order");
    expect(linkLabel({ kind: "dashboard", subpath: "/orders" }, "View")).toBe("Open in dashboard");
    expect(linkLabel({ kind: "path", path: "/x" })).toBe("Open");
    expect(linkLabel(null, "Go")).toBe("Go");
  });
});

describe("state", () => {
  test("pending action excludes actioned, archived, and snoozed", () => {
    expect(isPendingAction({ needsAction: true }, NOW)).toBe(true);
    expect(isPendingAction({ needsAction: true, actionedAt: NOW }, NOW)).toBe(false);
    expect(isPendingAction({ needsAction: true, dismissedAt: NOW }, NOW)).toBe(false);
    expect(isPendingAction({ needsAction: true, snoozedUntil: NOW + HOUR }, NOW)).toBe(false);
    expect(isPendingAction({ needsAction: true, snoozedUntil: NOW - HOUR }, NOW)).toBe(true);
    expect(isPendingAction({ needsAction: false }, NOW)).toBe(false);
  });

  test("matchesView mirrors the backend views", () => {
    const base = { needsAction: true } as const;
    expect(matchesView(base, "inbox", NOW)).toBe(true);
    expect(matchesView(base, "unread", NOW)).toBe(true);
    expect(matchesView(base, "needs", NOW)).toBe(true);
    expect(matchesView({ ...base, readAt: NOW }, "unread", NOW)).toBe(false);
    expect(matchesView({ ...base, snoozedUntil: NOW + HOUR }, "snoozed", NOW)).toBe(true);
    expect(matchesView({ ...base, snoozedUntil: NOW + HOUR }, "inbox", NOW)).toBe(false);
    expect(matchesView({ ...base, dismissedAt: NOW }, "archived", NOW)).toBe(true);
    expect(matchesView({ ...base, dismissedAt: NOW }, "needs", NOW)).toBe(false);
  });

  test("summary line", () => {
    expect(summaryLine({ inbox: 3, unread: 0, needs: 0, snoozed: 0, archived: 0 })).toBe("You're all caught up.");
    expect(summaryLine({ inbox: 3, unread: 2, needs: 1, snoozed: 0, archived: 0 })).toBe("2 unread, 1 needs you.");
    expect(summaryLine({ inbox: 3, unread: 2, needs: 2, snoozed: 0, archived: 0 })).toBe("2 unread, 2 need you.");
  });
});

describe("snooze presets", () => {
  test("later today lands later today, tomorrow at 9, next week on Monday at 9", () => {
    const later = SNOOZE_PRESETS[0].until(NOW);
    expect(later).toBeGreaterThan(NOW);
    expect(new Date(later).getDate()).toBe(new Date(NOW).getDate());

    const tomorrow = new Date(SNOOZE_PRESETS[1].until(NOW));
    expect(tomorrow.getDate()).toBe(5);
    expect(tomorrow.getHours()).toBe(9);

    const nextWeek = new Date(SNOOZE_PRESETS[2].until(NOW));
    expect(nextWeek.getDay()).toBe(1);
    expect(nextWeek.getHours()).toBe(9);
    expect(nextWeek.getTime()).toBeGreaterThan(NOW);
  });

  test("later today in the evening falls back to three hours out", () => {
    const evening = new Date(2026, 8, 4, 21, 0, 0).getTime();
    const later = SNOOZE_PRESETS[0].until(evening);
    expect(later).toBe(evening + 3 * HOUR);
  });
});

describe("time helpers", () => {
  test("relativeTime handles past and future", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(relativeTime(NOW - 3 * HOUR, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 26 * HOUR, NOW)).toBe("yesterday");
    expect(relativeTime(NOW - 3 * 24 * HOUR, NOW)).toBe("3 days ago");
    expect(relativeTime(NOW + 2 * HOUR, NOW)).toBe("in 2h");
    expect(relativeTime(NOW + 25 * HOUR, NOW)).toBe("tomorrow");
  });

  test("dayLabel and groupByDay", () => {
    expect(dayLabel(NOW - HOUR, NOW)).toBe("Today");
    expect(dayLabel(NOW - 24 * HOUR, NOW)).toBe("Yesterday");
    expect(dayLabel(NOW - 3 * 24 * HOUR, NOW)).toBe("This week");
    expect(dayLabel(NOW - 20 * 24 * HOUR, NOW)).toBe("Earlier this month");
    const groups = groupByDay([{ createdAt: NOW - HOUR }, { createdAt: NOW - 2 * HOUR }, { createdAt: NOW - 24 * HOUR }], NOW);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["Today", 2], ["Yesterday", 1]]);
  });

  test("searchText includes the kind label", () => {
    expect(searchText({ title: "A", message: "B", kind: "commerce", actorName: "Sam", ticketNumber: undefined })).toContain("orders and billing");
  });
});
