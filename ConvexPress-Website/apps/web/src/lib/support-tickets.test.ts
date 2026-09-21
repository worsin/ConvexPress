import { describe, expect, test } from "bun:test";

import {
  addFilesToSelection,
  compareTickets,
  explainError,
  initials,
  looksLikeTicketNumber,
  matchesFilter,
  needsYou,
  sortCategories,
  validateAttachment,
  validateTicketDraft,
  type TicketOverview,
} from "./support-tickets";

function ticket(overrides: Omit<Partial<TicketOverview>, "_id"> & { _id?: string }): TicketOverview {
  return {
    ticketNumber: "TKT-202609-00001",
    subject: "Help",
    category: "general",
    status: "open",
    priority: "medium",
    messageCount: 1,
    createdAt: 1,
    updatedAt: 1,
    unread: false,
    waitingOnYou: false,
    finished: false,
    lastMessagePreview: "",
    lastMessageSender: "user",
    agentName: null,
    agentInitials: null,
    responseWindow: "soon",
    ...overrides,
    _id: (overrides._id ?? "t") as TicketOverview["_id"],
  };
}

describe("filters and sorting", () => {
  test("needsYou and matchesFilter", () => {
    expect(needsYou(ticket({ status: "awaitingResponse" }))).toBe(true);
    expect(needsYou(ticket({ status: "open", unread: true }))).toBe(true);
    expect(needsYou(ticket({ status: "open" }))).toBe(false);
    expect(matchesFilter(ticket({ status: "resolved" }), "done")).toBe(true);
    expect(matchesFilter(ticket({ status: "resolved" }), "active")).toBe(false);
    expect(matchesFilter(ticket({ status: "open", unread: true }), "yours")).toBe(true);
    expect(matchesFilter(ticket({ status: "closed" }), "all")).toBe(true);
  });

  test("yours first, then recency", () => {
    const rows = [
      ticket({ _id: "a", updatedAt: 3 }),
      ticket({ _id: "b", status: "awaitingResponse", updatedAt: 1 }),
      ticket({ _id: "c", updatedAt: 5, lastMessageAt: 5 }),
      ticket({ _id: "d", unread: true, updatedAt: 2 }),
    ];
    expect([...rows].sort(compareTickets).map((r) => r._id)).toEqual(["d", "b", "c", "a"]);
  });

  test("category ordering keeps known categories in preferred order", () => {
    const sorted = sortCategories([{ value: "other" }, { value: "custom" }, { value: "technical" }, { value: "billing" }]);
    expect(sorted.map((c) => c.value)).toEqual(["technical", "billing", "other", "custom"]);
  });
});

describe("validation", () => {
  test("draft validation trims and reports field errors", () => {
    const bad = validateTicketDraft({ subject: "  hi ", description: "short" });
    expect(bad.fieldErrors.subject).toBeDefined();
    expect(bad.fieldErrors.description).toBeDefined();
    const good = validateTicketDraft({ subject: "  My   order  ", description: "It did not arrive yet." });
    expect(good.fieldErrors).toEqual({});
    expect(good.values.subject).toBe("My order");
  });

  test("attachments", () => {
    expect(validateAttachment({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
    expect(validateAttachment({ name: "a.exe", type: "application/octet-stream", size: 10 })).not.toBeNull();
    expect(validateAttachment({ name: "a.png", type: "image/png", size: 11 * 1024 * 1024 })).not.toBeNull();
    const file = (name: string, type = "image/png") => ({ name, type, size: 5 }) as unknown as File;
    const { files, problem } = addFilesToSelection([], [file("1.png"), file("2.exe", "x/y"), file("3.png")]);
    expect(files.map((f) => f.name)).toEqual(["1.png", "3.png"]);
    expect(problem).toContain("2.exe");
    const capped = addFilesToSelection([file("a"), file("b"), file("c"), file("d"), file("e")], [file("f")]);
    expect(capped.files.length).toBe(5);
    expect(capped.problem).toContain("Up to 5");
  });

  test("explainError unwraps ConvexError data", () => {
    expect(explainError({ data: { message: "Nope" } })).toBe("Nope");
    expect(explainError({ data: "Plain" })).toBe("Plain");
    expect(explainError(new Error("[Request ID: x] Server Error Uncaught ConvexError: Too long"))).toBe("Too long");
    expect(explainError(null, "fallback")).toBe("fallback");
  });

  test("names and ticket numbers", () => {
    expect(initials("Ana Rivera")).toBe("AR");
    expect(looksLikeTicketNumber("TKT-202609-00042")).toBe(true);
    expect(looksLikeTicketNumber("k57abc")).toBe(false);
  });
});
