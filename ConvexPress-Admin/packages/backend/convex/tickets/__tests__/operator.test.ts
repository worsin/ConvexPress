/**
 * Ticket operator actions (PR 078): an application answers tickets for its
 * own staff, who have no ConvexPress account. Replies reach the customer as a
 * ConvexPress agent's would; status moves follow the operator transitions;
 * a taken ticket shows the agent's name everywhere; settings and saved
 * replies record who changed them; the figures count what is still waiting.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/tickets/operator.ts": () => import("../operator"),
  "./convex/tickets/queries.ts": () => import("../queries"),
};

const agent = { ref: "staff:42", name: "Morgan Reyes", email: "morgan@example.invalid" };
const MINUTE = 60_000;

async function fixture() {
  const t = convexTest({ schema, modules });
  const customerId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "avery@example.invalid", displayName: "Avery Quinn", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1 }),
  );
  const ticket = (overrides: Partial<{ status: "open" | "resolved" | "closed" | "inProgress" | "awaitingResponse"; createdAt: number; priority: "low" | "urgent"; category: "billing" | "technical" }> = {}) =>
    t.run(async (ctx) => {
      const createdAt = overrides.createdAt ?? Date.now();
      const ticketId = await ctx.db.insert("ticket_tickets", {
        ticketNumber: `TKT-202610-${String(createdAt).slice(-5)}`,
        userId: customerId,
        userEmailSnapshot: "avery@example.invalid",
        userNameSnapshot: "Avery Quinn",
        subject: "Can't open my invoice",
        description: "The invoice link says it expired.",
        category: overrides.category ?? "billing",
        status: overrides.status ?? "open",
        priority: overrides.priority ?? "low",
        source: "dashboard",
        tags: [],
        aiAttempted: false,
        messageCount: 1,
        lastMessageAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
      await ctx.db.insert("ticket_messages", { ticketId, sequence: 0, senderType: "user", senderId: customerId, senderName: "Avery Quinn", content: "The invoice link says it expired.", isInternal: false, createdAt });
      return ticketId;
    });
  const events = (code: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query("events").collect())
        .filter((event) => event.code === code)
        .map((event): Record<string, unknown> => JSON.parse(event.payload)),
    );
  return { t, customerId, ticket, events };
}

describe("ticket operator", () => {
  test("a reply reaches the customer as an agent's; an internal note doesn't", async () => {
    const f = await fixture();
    const ticketId = await f.ticket();
    const reply = await f.t.mutation(internal.tickets.operator.reply, { ticketId, agent, content: "  I've sent you a new invoice link.  ", isInternal: false });
    expect(reply.status).toBe("awaitingResponse");
    const note = await f.t.mutation(internal.tickets.operator.reply, { ticketId, agent, content: "Stripe link expired after 30 days.", isInternal: true });
    expect(note.status).toBe("awaitingResponse");

    const state = await f.t.run(async (ctx) => ({
      ticket: await ctx.db.get("ticket_tickets", ticketId),
      messages: await ctx.db.query("ticket_messages").withIndex("by_ticket_sequence", (q) => q.eq("ticketId", ticketId)).collect(),
    }));
    expect(state.ticket).toMatchObject({ status: "awaitingResponse", messageCount: 3, lastMessageSenderType: "admin" });
    expect(state.ticket?.firstResponseAt).toBeNumber();
    expect(state.messages.map((m) => [m.sequence, m.senderType, m.senderName, m.senderRef ?? null, m.isInternal])).toEqual([
      [0, "user", "Avery Quinn", null, false],
      [1, "admin", "Morgan Reyes", "staff:42", false],
      [2, "admin", "Morgan Reyes", "staff:42", true],
    ]);
    expect(state.messages[1]?.content).toBe("I've sent you a new invoice link.");

    // The customer's email listener keys on these: an agent's public reply, then a note it skips.
    const replied = await f.events("ticket.replied");
    expect(replied.map((payload) => [payload.senderType, payload.isInternal, payload.senderRef])).toEqual([
      ["admin", false, "staff:42"],
      ["admin", true, "staff:42"],
    ]);

    // The queue's thread shows notes to staff, newest first.
    const page = await f.t.query(internal.tickets.operator.listMessages, { ticketId, paginationOpts: { numItems: 2, cursor: null } });
    expect(page.page.map((m) => m.sequence)).toEqual([2, 1]);
    expect(page.isDone).toBe(false);
  });

  test("refuses short replies, notes with a saved reply, and replies to a closed ticket", async () => {
    const f = await fixture();
    const ticketId = await f.ticket();
    await expect(f.t.mutation(internal.tickets.operator.reply, { ticketId, agent, content: "ok", isInternal: false })).rejects.toThrow(/between 10/);
    const { id } = await f.t.mutation(internal.tickets.operator.saveCannedResponse, { agent, title: "New link", shortcut: "/link", content: "Here's a new link, {{userName}}.", category: "billing" });
    await expect(
      f.t.mutation(internal.tickets.operator.reply, { ticketId, agent, content: "Here's a new link, Avery.", isInternal: true, cannedResponseId: id }),
    ).rejects.toThrow(/Saved replies/);
    await f.t.mutation(internal.tickets.operator.reply, { ticketId, agent, content: "Here's a new link, Avery.", isInternal: false, cannedResponseId: id });
    expect((await f.t.query(internal.tickets.operator.listCannedResponses, {}))[0]).toMatchObject({ shortcut: "/link", usageCount: 1 });

    const closed = await f.ticket({ status: "closed" });
    await expect(f.t.mutation(internal.tickets.operator.reply, { ticketId: closed, agent, content: "Following up on this.", isInternal: false })).rejects.toThrow(/Reopen it/);
  });

  test("status moves follow the transitions, record when, and reopening clears them", async () => {
    const f = await fixture();
    const ticketId = await f.ticket();
    const detail = await f.t.query(internal.tickets.operator.getTicket, { ticketId });
    expect(detail?.allowedStatuses).toEqual(["inProgress", "awaitingResponse", "resolved", "closed"]);

    expect(await f.t.mutation(internal.tickets.operator.setStatus, { ticketId, agent, status: "resolved" })).toEqual({ status: "resolved", changed: true });
    expect(await f.t.mutation(internal.tickets.operator.setStatus, { ticketId, agent, status: "resolved" })).toEqual({ status: "resolved", changed: false });
    await expect(f.t.mutation(internal.tickets.operator.setStatus, { ticketId, agent, status: "inProgress" })).rejects.toThrow(/can't be moved/);
    await f.t.mutation(internal.tickets.operator.setStatus, { ticketId, agent, status: "closed" });
    const closed = await f.t.query(internal.tickets.operator.getTicket, { ticketId });
    expect(closed).toMatchObject({ status: "closed", allowedStatuses: ["open"] });
    expect(closed?.resolvedAt).toBeNumber();
    expect(closed?.closedAt).toBeNumber();

    await f.t.mutation(internal.tickets.operator.setStatus, { ticketId, agent, status: "open" });
    const reopened = await f.t.query(internal.tickets.operator.getTicket, { ticketId });
    expect(reopened?.status).toBe("open");
    expect(reopened?.resolvedAt).toBeUndefined();
    expect(reopened?.closedAt).toBeUndefined();

    // The resolution email listener fires once, on the move to resolved.
    expect((await f.events("ticket.resolved")).map((payload) => payload.changedByRef)).toEqual(["staff:42"]);
  });

  test("a taken ticket names the agent in the queue and to the customer, and can be let go", async () => {
    const f = await fixture();
    const ticketId = await f.ticket();
    expect(await f.t.mutation(internal.tickets.operator.assign, { ticketId, agent, take: true })).toEqual({ changed: true });
    expect(await f.t.mutation(internal.tickets.operator.assign, { ticketId, agent, take: true })).toEqual({ changed: false });
    const [row] = (await f.t.query(internal.tickets.operator.listQueue, { paginationOpts: { numItems: 10, cursor: null } })).page;
    expect(row).toMatchObject({ status: "inProgress", assigneeName: "Morgan Reyes", assignedAgentRef: "staff:42", categoryLabel: "Billing" });

    // The customer's own view names the agent too.
    const asCustomer = f.t.withIdentity({ subject: f.customerId, tokenIdentifier: `https://convexpress-admin.local|${f.customerId}` });
    const overview = await asCustomer.query(api.tickets.queries.getMyTicketsOverview, {});
    expect(overview?.tickets[0]?.agentName ?? null).toBe("Morgan Reyes");

    // Someone else's agent letting go changes nothing; theirs does.
    expect(await f.t.mutation(internal.tickets.operator.assign, { ticketId, agent: { ref: "staff:7", name: "Sam Lee" }, take: false })).toEqual({ changed: false });
    expect(await f.t.mutation(internal.tickets.operator.assign, { ticketId, agent, take: false })).toEqual({ changed: true });
    expect((await f.t.query(internal.tickets.operator.getTicket, { ticketId }))?.assigneeName).toBeUndefined();
  });

  test("settings and saved replies record the agent, and shortcuts stay unique", async () => {
    const f = await fixture();
    const result = await f.t.mutation(internal.tickets.operator.updateSettings, {
      agent,
      general: { categories: [{ value: "billing", label: "Billing and payments" }], autoCloseAfterDays: 7 },
      sla: { firstResponseTarget: 60 },
    });
    expect(result.updatedSections).toEqual(["ticket.general", "ticket.sla"]);
    expect((await f.t.mutation(internal.tickets.operator.updateSettings, { agent, sla: { firstResponseTarget: 60 } })).updatedSections).toEqual([]);
    const settings = await f.t.query(internal.tickets.operator.getSettings, {});
    expect(settings.general).toMatchObject({ categories: [{ value: "billing", label: "Billing and payments" }], autoCloseAfterDays: 7, defaultPriority: "medium" });
    expect(settings.sla).toEqual({ firstResponseTarget: 60, resolutionTarget: 2880 });
    const rows = await f.t.run((ctx) => ctx.db.query("settings").collect());
    expect(rows.map((row) => [row.section, row.updatedByRef, row.updatedBy ?? null])).toEqual([
      ["ticket.general", "staff:42", null],
      ["ticket.sla", "staff:42", null],
    ]);

    const { id } = await f.t.mutation(internal.tickets.operator.saveCannedResponse, { agent, title: "Invoice", shortcut: "/invoice", content: "Your invoice is attached.", category: "billing" });
    await expect(
      f.t.mutation(internal.tickets.operator.saveCannedResponse, { agent, title: "Other", shortcut: "/invoice", content: "Something else.", category: "" }),
    ).rejects.toThrow(/already in use/);
    await f.t.mutation(internal.tickets.operator.saveCannedResponse, { agent, id, title: "Invoice copy", shortcut: "/invoice", content: "Your invoice is attached.", category: "billing" });
    const saved = await f.t.run((ctx) => ctx.db.get("ticket_cannedResponses", id));
    expect(saved).toMatchObject({ title: "Invoice copy", createdByRef: "staff:42" });
    expect(await f.t.mutation(internal.tickets.operator.removeCannedResponse, { id })).toEqual({ removed: true });
    expect(await f.t.mutation(internal.tickets.operator.removeCannedResponse, { id })).toEqual({ removed: false });
  });

  test("figures count what's waiting, measure against the targets, and say when they're capped", async () => {
    const f = await fixture();
    await f.t.mutation(internal.tickets.operator.updateSettings, { agent, sla: { firstResponseTarget: 60, resolutionTarget: 600 } });
    const now = Date.now();
    // Answered in 30 minutes and resolved in 5 hours: both targets met.
    const fast = await f.ticket({ createdAt: now - 10 * 60 * MINUTE, category: "technical" });
    await f.t.run((ctx) => ctx.db.patch("ticket_tickets", fast, { status: "resolved", firstResponseAt: now - 9.5 * 60 * MINUTE, resolvedAt: now - 5 * 60 * MINUTE }));
    // Urgent, untaken, unanswered for two hours: first response missed, resolution still in time.
    await f.ticket({ createdAt: now - 120 * MINUTE, priority: "urgent" });
    // Brand new: counts for neither target yet.
    const fresh: Id<"ticket_tickets"> = await f.ticket({ createdAt: now - MINUTE });
    await f.t.mutation(internal.tickets.operator.assign, { ticketId: fresh, agent, take: true });

    const stats = await f.t.query(internal.tickets.operator.queueStats, {});
    expect(stats).toMatchObject({
      totalTickets: 3,
      statusCounts: { open: 1, inProgress: 1, awaitingResponse: 0, resolved: 1, closed: 0 },
      urgentActive: 1,
      unassignedActive: 1,
      averageFirstResponseMinutes: 30,
      averageResolutionMinutes: 300,
      firstResponseTargetPercent: 50,
      resolutionTargetPercent: 100,
      firstResponseTargetMinutes: 60,
      resolutionTargetMinutes: 600,
      categoryCounts: [
        { category: "billing", label: "Billing", count: 2 },
        { category: "technical", label: "Technical", count: 1 },
      ],
      recordsCapped: false,
      recordLimit: 3000,
    });
    expect(stats.windowStartAt).toBeUndefined();

    const capped = await f.t.query(internal.tickets.operator.queueStats, { recordLimit: 2 });
    expect(capped).toMatchObject({ totalTickets: 2, recordsCapped: true, recordLimit: 2, windowStartAt: now - 120 * MINUTE });
  });
});
