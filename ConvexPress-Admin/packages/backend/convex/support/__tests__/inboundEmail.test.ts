/**
 * Tickets that arrive by email (PR 083) behave like the website's: a reply is
 * kept only on the sender's own ticket, messages continue in order, a reply
 * reopens a resolved ticket, and both raise the events that alert staff and
 * keep the customer's views current.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/support/inboundEmail.ts": () => import("../inboundEmail"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    await ctx.db.insert("support_channels", { code: "support-email", kind: "email", label: "Support email", isActive: true, createdAt: 1, updatedAt: 1 });
    for (const email of ["avery@example.invalid", "sam@example.invalid"]) {
      await ctx.db.insert("users", { email, authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1 });
    }
  });
  let external = 0;
  const receive = (fromEmail: string, body: string, ticketNumber?: string) =>
    t.mutation(internal.support.inboundEmail.recordInboundEmail, {
      channelCode: "support-email", externalId: `message-${++external}`, fromEmail, subject: "Invoice link", body,
      rawPayload: "{}", receivedAt: Date.now(), ...(ticketNumber ? { ticketNumber } : {}),
    });
  const events = (code: string) =>
    t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((event) => event.code === code).map((event): Record<string, unknown> => JSON.parse(event.payload)));
  const ticketByNumber = (ticketNumber: string) =>
    t.run((ctx) => ctx.db.query("ticket_tickets").withIndex("by_ticket_number", (q) => q.eq("ticketNumber", ticketNumber)).unique());
  return { t, receive, events, ticketByNumber };
}

test("a new ticket by email opens with message 0 and raises ticket.created", async () => {
  const f = await fixture();
  const result = await f.receive("avery@example.invalid", "The invoice link has expired.");
  expect(result.ok).toBe(true);
  const created = await f.events("ticket.created");
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ source: "email" });
  const messages = await f.t.run((ctx) => ctx.db.query("ticket_messages").collect());
  expect(messages.map((message) => message.sequence)).toEqual([0]);
});

test("a reply continues the sender's own ticket, reopens it, and raises ticket.replied", async () => {
  const f = await fixture();
  await f.receive("avery@example.invalid", "The invoice link has expired.");
  const [ticket] = await f.t.run((ctx) => ctx.db.query("ticket_tickets").collect());
  if (!ticket) throw new Error("ticket missing");
  await f.t.run((ctx) => ctx.db.patch("ticket_tickets", ticket._id, { status: "resolved", resolvedAt: Date.now() }));

  await f.receive("avery@example.invalid", "It's expired again, sorry.", ticket.ticketNumber);
  const after = await f.ticketByNumber(ticket.ticketNumber);
  expect(after).toMatchObject({ status: "open", messageCount: 2, lastMessageSenderType: "user" });
  expect(after?.resolvedAt).toBeUndefined();
  const messages = await f.t.run((ctx) => ctx.db.query("ticket_messages").withIndex("by_ticket_sequence", (q) => q.eq("ticketId", ticket._id)).collect());
  expect(messages.map((message) => message.sequence)).toEqual([0, 1]);
  expect((await f.events("ticket.replied")).map((payload) => [payload.senderType, payload.source])).toEqual([["user", "email"]]);
});

test("someone quoting another person's ticket number opens a ticket of their own", async () => {
  const f = await fixture();
  await f.receive("avery@example.invalid", "The invoice link has expired.");
  const [ticket] = await f.t.run((ctx) => ctx.db.query("ticket_tickets").collect());
  if (!ticket) throw new Error("ticket missing");

  await f.receive("sam@example.invalid", "Adding myself to this ticket.", ticket.ticketNumber);
  expect(await f.ticketByNumber(ticket.ticketNumber)).toMatchObject({ messageCount: 1 });
  const tickets = await f.t.run((ctx) => ctx.db.query("ticket_tickets").collect());
  expect(tickets.map((row) => row.userEmailSnapshot).sort()).toEqual(["avery@example.invalid", "sam@example.invalid"]);
  expect(await f.events("ticket.replied")).toHaveLength(0);
});
