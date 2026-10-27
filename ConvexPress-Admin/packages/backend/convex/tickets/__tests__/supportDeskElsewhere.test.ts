/**
 * The support desk handed to another system (PR 082): when a site's code
 * marks the `supportDesk` area managed, staff can't answer or work tickets
 * here, and are told where they're answered. Customers' own tickets work as
 * before, and the other system still answers through tickets/operator.ts.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/managedRecords/internals.ts": () => import("../../managedRecords/internals"),
  "./convex/tickets/mutations.ts": () => import("../mutations"),
  "./convex/tickets/messages.ts": () => import("../messages"),
  "./convex/tickets/cannedResponses.ts": () => import("../cannedResponses"),
  "./convex/tickets/settings.ts": () => import("../settings"),
  "./convex/tickets/operator.ts": () => import("../operator"),
};

const STAFF = [
  "ticket.view", "ticket.viewAll", "ticket.respond", "ticket.viewInternalNotes", "ticket.updateStatus", "ticket.updatePriority",
  "ticket.assign", "ticket.close", "ticket.manageCannedResponses", "manage_options",
];
const ISSUER = "https://convexpress-admin.local";

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Support", slug: "support", description: "Fixture", level: 90, type: "internal", status: "active",
      isDefault: false, isProtected: false, capabilities: STAFF, pageAccess: [], createdAt: 1, updatedAt: 1,
    });
    const staff = await ctx.db.insert("users", { email: "staff@example.invalid", authSource: "local", status: "active", emailVerified: true, roleId, createdAt: 1, updatedAt: 1 });
    const customer = await ctx.db.insert("users", { email: "avery@example.invalid", displayName: "Avery Quinn", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1 });
    const now = Date.now();
    const ticket = await ctx.db.insert("ticket_tickets", {
      ticketNumber: "TKT-202610-00001", userId: customer, userEmailSnapshot: "avery@example.invalid", userNameSnapshot: "Avery Quinn",
      subject: "Can't open my invoice", description: "The invoice link says it expired.", category: "billing", status: "open",
      priority: "low", source: "dashboard", tags: [], aiAttempted: false, messageCount: 1, lastMessageAt: now, createdAt: now, updatedAt: now,
    });
    const first = await ctx.db.insert("ticket_messages", {
      ticketId: ticket, sequence: 0, senderType: "user", senderId: customer, senderName: "Avery Quinn", content: "The invoice link says it expired.", isInternal: false, createdAt: now,
    });
    const saved = await ctx.db.insert("ticket_cannedResponses", {
      title: "New link", shortcut: "/link", content: "Here's a new link.", category: "billing", usageCount: 0, createdBy: staff, createdAt: 1, updatedAt: 1,
    });
    return { staff, customer, ticket, first, saved };
  });
  const as = (id: string) => t.withIdentity({ subject: id, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${id}` });
  return { t, ids, staff: as(ids.staff), customer: as(ids.customer) };
}

test("with the desk elsewhere, staff can't work tickets here and are told where", async () => {
  const f = await fixture();
  // Before the hand-off, staff work tickets here as usual.
  await f.staff.mutation(api.tickets.mutations.updatePriority, { ticketId: f.ids.ticket, priority: "high" });

  await f.t.mutation(internal.managedRecords.internals.setManaged, {
    tableName: "area", recordId: "supportDesk", system: "the CaseMedix CRM", note: "Answer tickets in the CRM's Support section.",
  });
  const elsewhere = /The support desk is managed by the CaseMedix CRM, so it can't be changed here\. Answer tickets in the CRM's Support section\./;
  const { ticket, saved } = f.ids;
  const refused = [
    () => f.staff.mutation(api.tickets.mutations.adminReply, { ticketId: ticket, content: "I've sent you a new invoice link." }),
    () => f.staff.mutation(api.tickets.mutations.updateStatus, { ticketId: ticket, status: "resolved" }),
    () => f.staff.mutation(api.tickets.mutations.updatePriority, { ticketId: ticket, priority: "urgent" }),
    () => f.staff.mutation(api.tickets.mutations.assign, { ticketId: ticket, assigneeId: f.ids.staff }),
    () => f.staff.mutation(api.tickets.mutations.unassign, { ticketId: ticket }),
    () => f.staff.mutation(api.tickets.mutations.close, { ticketId: ticket }),
    () => f.staff.mutation(api.tickets.mutations.addTags, { ticketId: ticket, tags: ["invoice"] }),
    () => f.staff.mutation(api.tickets.messages.addInternalNote, { ticketId: ticket, content: "Checking the invoice link." }),
    () => f.staff.mutation(api.tickets.messages.edit, { messageId: f.ids.first, content: "Edited by staff, not the customer." }),
    () => f.staff.mutation(api.tickets.cannedResponses.create, { title: "Thanks", shortcut: "/thanks", content: "Thanks for writing in.", category: "general" }),
    () => f.staff.mutation(api.tickets.cannedResponses.remove, { id: saved }),
    () => f.staff.mutation(api.tickets.cannedResponses.incrementUsage, { id: saved }),
    () => f.staff.mutation(api.tickets.settings.updateTicketSettings, { general: { autoCloseAfterDays: 3 } }),
  ];
  for (const attempt of refused) await expect(attempt()).rejects.toThrow(elsewhere);
  expect(await f.t.run((ctx) => ctx.db.get("ticket_tickets", ticket))).toMatchObject({ status: "open", priority: "high", tags: [] });

  // The customer's own ticket works as before.
  await f.customer.mutation(api.tickets.mutations.reply, { ticketId: ticket, content: "Here's a screenshot of the error." });
  // The other system answers through the operator functions.
  const answered = await f.t.mutation(internal.tickets.operator.reply, {
    ticketId: ticket, agent: { ref: "staff:42", name: "Morgan Reyes" }, content: "I've sent you a new invoice link.", isInternal: false,
  });
  expect(answered.status).toBe("awaitingResponse");
});
