import { describe, expect, test } from "bun:test";

import {
  canCustomerReply,
  canRate,
  compareForCustomerList,
  initials,
  isUnreadForCustomer,
  isWaitingOnCustomer,
  messagePreview,
  overviewCounts,
  responseWindowForCategory,
  responseWindowText,
  statusAfterAgentReply,
  statusAfterCustomerReply,
  validateAttachmentList,
  validateAttachmentMeta,
} from "../customer";

const NOW = 1_800_000_000_000;

describe("read state", () => {
  test("unread when an agent replied after the customer last opened the thread", () => {
    expect(isUnreadForCustomer({ lastAgentMessageAt: NOW, lastCustomerReadAt: NOW - 1 })).toBe(true);
    expect(isUnreadForCustomer({ lastAgentMessageAt: NOW, lastCustomerReadAt: NOW })).toBe(false);
    expect(isUnreadForCustomer({ lastAgentMessageAt: NOW, lastCustomerReadAt: undefined })).toBe(true);
    expect(isUnreadForCustomer({ lastAgentMessageAt: undefined, lastCustomerReadAt: undefined })).toBe(false);
    expect(isUnreadForCustomer({ lastAgentMessageAt: NOW - 10, lastCustomerReadAt: NOW })).toBe(false);
  });

  test("waiting on the customer only for awaitingResponse", () => {
    expect(isWaitingOnCustomer({ status: "awaitingResponse" })).toBe(true);
    expect(isWaitingOnCustomer({ status: "open" })).toBe(false);
    expect(isWaitingOnCustomer({ status: "resolved" })).toBe(false);
  });

  test("reply / rate permissions follow status", () => {
    expect(canCustomerReply({ status: "resolved" })).toBe(true);
    expect(canCustomerReply({ status: "closed" })).toBe(false);
    expect(canRate({ status: "resolved" })).toBe(true);
    expect(canRate({ status: "resolved", rating: 4 })).toBe(false);
    expect(canRate({ status: "open" })).toBe(false);
  });

  test("status transitions", () => {
    expect(statusAfterCustomerReply("awaitingResponse")).toBe("open");
    expect(statusAfterCustomerReply("resolved")).toBe("open");
    expect(statusAfterCustomerReply("closed")).toBe("open");
    expect(statusAfterCustomerReply("inProgress")).toBe("inProgress");
    expect(statusAfterAgentReply("open")).toBe("awaitingResponse");
    expect(statusAfterAgentReply("inProgress")).toBe("awaitingResponse");
    expect(statusAfterAgentReply("resolved")).toBe("resolved");
  });
});

describe("overview", () => {
  test("counts yours / active / done", () => {
    const counts = overviewCounts([
      { status: "awaitingResponse" },
      { status: "open", lastAgentMessageAt: NOW, lastCustomerReadAt: NOW - 1 },
      { status: "open" },
      { status: "resolved", lastAgentMessageAt: NOW },
      { status: "closed", lastAgentMessageAt: NOW, lastCustomerReadAt: NOW + 1 },
    ]);
    expect(counts).toEqual({ yours: 3, active: 3, done: 2, total: 5 });
  });

  test("sorts tickets needing the customer first, then by recent activity", () => {
    const rows = [
      { status: "open" as const, updatedAt: 3, lastMessageAt: 3 },
      { status: "awaitingResponse" as const, updatedAt: 1, lastMessageAt: 1 },
      { status: "resolved" as const, updatedAt: 5 },
      { status: "open" as const, updatedAt: 2, lastAgentMessageAt: 2 },
    ];
    const sorted = [...rows].sort(compareForCustomerList).map((r) => r.updatedAt);
    expect(sorted).toEqual([2, 1, 5, 3]);
  });
});

describe("copy helpers", () => {
  test("messagePreview strips markup and truncates", () => {
    expect(messagePreview("<p>Hello <b>there</b></p>\n\nNew   line")).toBe("Hello there New line");
    expect(messagePreview("a".repeat(200), 10)).toBe("aaaaaaaaa…");
    expect(messagePreview("**bold** and `code`")).toBe("bold and code");
  });

  test("responseWindowText scales with the SLA target", () => {
    expect(responseWindowText(30)).toBe("within about 30 minutes");
    expect(responseWindowText(60)).toBe("within about an hour");
    expect(responseWindowText(240)).toBe("within about 4 hours");
    expect(responseWindowText(1440)).toBe("within one business day");
    expect(responseWindowText(2880)).toBe("within 2 business days");
    expect(responseWindowText(0)).toBe("as soon as we can");
    expect(responseWindowText(undefined)).toBe("as soon as we can");
  });

  test("per-category override beats the site-wide SLA", () => {
    expect(responseWindowForCategory({ firstResponseTarget: 1440 }, 240)).toBe("within one business day");
    expect(responseWindowForCategory({}, 240)).toBe("within about 4 hours");
    expect(responseWindowForCategory(undefined, undefined)).toBe("as soon as we can");
  });

  test("initials", () => {
    expect(initials("Ana Rivera")).toBe("AR");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });
});

describe("attachments", () => {
  test("accepts screenshots and PDFs under the limit", () => {
    expect(validateAttachmentMeta({ name: "shot.png", mimeType: "image/png", size: 1024 })).toBeNull();
    expect(validateAttachmentMeta({ name: "doc.pdf", mimeType: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
  });

  test("rejects the wrong type, oversize, empty, and unnamed files", () => {
    expect(validateAttachmentMeta({ name: "x.exe", mimeType: "application/x-msdownload", size: 10 })).not.toBeNull();
    expect(validateAttachmentMeta({ name: "big.png", mimeType: "image/png", size: 11 * 1024 * 1024 })).not.toBeNull();
    expect(validateAttachmentMeta({ name: "empty.png", mimeType: "image/png", size: 0 })).not.toBeNull();
    expect(validateAttachmentMeta({ name: "", mimeType: "image/png", size: 10 })).not.toBeNull();
  });

  test("caps the number of files per message", () => {
    const file = { name: "a.png", mimeType: "image/png", size: 1 };
    expect(validateAttachmentList([file, file, file, file, file])).toBeNull();
    expect(validateAttachmentList([file, file, file, file, file, file])).not.toBeNull();
    expect(validateAttachmentList(undefined)).toBeNull();
  });
});
