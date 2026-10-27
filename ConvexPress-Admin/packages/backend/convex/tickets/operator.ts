/**
 * Tickets — operator actions.
 *
 * What an application that answers this site's tickets for its own staff can
 * do, for staff who have no ConvexPress account: read the queue and a
 * ticket's thread (internal notes included), reply or add an internal note,
 * change a ticket's status, take it or let it go, edit the ticket settings and
 * saved replies, and read the queue's figures.
 *
 * Internal functions: the caller has already authorised its agent. `agent.ref`
 * is the caller's own identifier for them, kept on everything they write
 * (a message's `senderRef`, the ticket's `assignedAgent`, a saved reply's
 * `createdByRef`, the settings' `updatedByRef`). Events are the ones
 * ConvexPress's own staff raise, so the customer gets the same emails.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { SYSTEM, TICKET_EVENTS } from "../events/constants";
import { emitEvent } from "../helpers/events";
import { requirePluginEnabled } from "../helpers/plugins";
import {
  messageSenderTypeValidator,
  ticketCategoryValidator,
  ticketPriorityValidator,
  ticketSourceValidator,
  ticketStatusValidator,
} from "../schema/tickets";
import { TICKET_GENERAL_DEFAULTS } from "../settings/defaults";
import { assigneeName, isAssigned } from "./assignee";
import { statusAfterAgentReply, type TicketStatus } from "./customer";
import { readTicketSettings, ticketSettingsArgs, ticketSettingsValidator, writeTicketSettings } from "./settings";
import {
  MAX_CANNED_CONTENT_LENGTH,
  MAX_CANNED_SHORTCUT_LENGTH,
  MAX_CANNED_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
} from "./validators";

type Ticket = Doc<"ticket_tickets">;

/** The caller's agent: its identifier for them, and how they sign their replies. */
export const operatorAgentValidator = v.object({ ref: v.string(), name: v.string(), email: v.optional(v.string()) });
type OperatorAgent = Infer<typeof operatorAgentValidator>;

/** Where an operator may move a ticket from each status. A closed ticket only reopens. */
export const OPERATOR_STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ["inProgress", "awaitingResponse", "resolved", "closed"],
  inProgress: ["open", "awaitingResponse", "resolved", "closed"],
  awaitingResponse: ["open", "inProgress", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

function cleanAgent(agent: OperatorAgent): OperatorAgent {
  const ref = agent.ref.trim();
  const name = agent.name.replace(/\s+/g, " ").trim();
  if (!ref || !name) throw new ConvexError({ code: "VALIDATION", message: "The agent needs an identifier and a name." });
  const email = agent.email?.trim();
  return { ref, name, ...(email ? { email } : {}) };
}

async function loadTicket(ctx: MutationCtx, ticketId: Id<"ticket_tickets">): Promise<Ticket> {
  const ticket = await ctx.db.get("ticket_tickets", ticketId);
  if (!ticket) throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found." });
  return ticket;
}

// ─── Reading the queue ──────────────────────────────────────────────────────

export const operatorQueueRowValidator = v.object({
  ticketId: v.id("ticket_tickets"),
  ticketNumber: v.string(),
  subject: v.string(),
  category: ticketCategoryValidator,
  categoryLabel: v.string(),
  status: ticketStatusValidator,
  priority: ticketPriorityValidator,
  source: ticketSourceValidator,
  customerId: v.id("users"),
  customerName: v.string(),
  customerEmail: v.string(),
  assigneeName: v.optional(v.string()),
  /** Set when one of the caller's agents has the ticket: their identifier. */
  assignedAgentRef: v.optional(v.string()),
  messageCount: v.number(),
  lastMessageAt: v.number(),
  firstResponseAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const operatorTicketDetailValidator = v.object({
  ...operatorQueueRowValidator.fields,
  description: v.string(),
  tags: v.array(v.string()),
  rating: v.optional(v.number()),
  ratingComment: v.optional(v.string()),
  resolvedAt: v.optional(v.number()),
  closedAt: v.optional(v.number()),
  allowedStatuses: v.array(ticketStatusValidator),
});

/** Category labels as the site's settings name them; a category the settings no longer list keeps its default label. */
async function categoryLabels(ctx: Pick<QueryCtx, "db">): Promise<Map<string, string>> {
  const { general } = await readTicketSettings(ctx);
  return new Map([...TICKET_GENERAL_DEFAULTS.categories, ...general.categories].map((category) => [category.value, category.label]));
}

async function queueRow(
  ctx: Pick<QueryCtx, "db">,
  ticket: Ticket,
  labels: Map<string, string>,
  names: Map<Id<"users">, string | null>,
): Promise<Infer<typeof operatorQueueRowValidator>> {
  const assignee = await assigneeName(ctx, ticket, names);
  return {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    categoryLabel: labels.get(ticket.category) ?? ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    customerId: ticket.userId,
    customerName: ticket.userNameSnapshot,
    customerEmail: ticket.userEmailSnapshot,
    ...(assignee ? { assigneeName: assignee } : {}),
    ...(ticket.assignedAgent ? { assignedAgentRef: ticket.assignedAgent.ref } : {}),
    messageCount: ticket.messageCount,
    lastMessageAt: ticket.lastMessageAt ?? ticket.createdAt,
    ...(ticket.firstResponseAt !== undefined ? { firstResponseAt: ticket.firstResponseAt } : {}),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

/** Every ticket, newest first. */
export const listQueue = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(operatorQueueRowValidator),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const page = await ctx.db.query("ticket_tickets").withIndex("by_created").order("desc").paginate(args.paginationOpts);
    const labels = await categoryLabels(ctx);
    const names = new Map<Id<"users">, string | null>();
    return { ...page, page: await Promise.all(page.page.map((ticket) => queueRow(ctx, ticket, labels, names))) };
  },
});

/** One ticket, with where its status may go next. Null when there is no such ticket. */
export const getTicket = internalQuery({
  args: { ticketId: v.id("ticket_tickets") },
  returns: v.union(v.null(), operatorTicketDetailValidator),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const ticket = await ctx.db.get("ticket_tickets", args.ticketId);
    if (!ticket) return null;
    const row = await queueRow(ctx, ticket, await categoryLabels(ctx), new Map());
    return {
      ...row,
      description: ticket.description,
      tags: ticket.tags,
      ...(ticket.rating !== undefined ? { rating: ticket.rating } : {}),
      ...(ticket.ratingComment ? { ratingComment: ticket.ratingComment } : {}),
      ...(ticket.resolvedAt !== undefined ? { resolvedAt: ticket.resolvedAt } : {}),
      ...(ticket.closedAt !== undefined ? { closedAt: ticket.closedAt } : {}),
      allowedStatuses: [...OPERATOR_STATUS_TRANSITIONS[ticket.status]],
    };
  },
});

export const operatorMessageRowValidator = v.object({
  messageId: v.id("ticket_messages"),
  sequence: v.number(),
  senderType: messageSenderTypeValidator,
  senderName: v.string(),
  content: v.string(),
  isInternal: v.boolean(),
  attachments: v.array(v.object({ name: v.string(), mimeType: v.string(), size: v.number(), url: v.union(v.string(), v.null()) })),
  createdAt: v.number(),
});

/** A ticket's messages, internal notes included, newest first. */
export const listMessages = internalQuery({
  args: { ticketId: v.id("ticket_tickets"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(operatorMessageRowValidator),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const page = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (message) => ({
          messageId: message._id,
          sequence: message.sequence,
          senderType: message.senderType,
          senderName: message.senderName,
          content: message.content,
          isInternal: message.isInternal,
          attachments: await Promise.all(
            (message.attachments ?? []).map(async (file) => ({
              name: file.name,
              mimeType: file.mimeType,
              size: file.size,
              url: await ctx.storage.getUrl(file.storageId),
            })),
          ),
          createdAt: message.createdAt,
        })),
      ),
    };
  },
});

// ─── Working a ticket ───────────────────────────────────────────────────────

/**
 * Reply to the customer, or add an internal note they never see. A reply
 * moves an open ticket to awaiting the customer and starts the first-response
 * clock's record; a saved reply's use is counted. A closed ticket is reopened
 * before anyone replies to it.
 */
export const reply = internalMutation({
  args: {
    ticketId: v.id("ticket_tickets"),
    agent: operatorAgentValidator,
    content: v.string(),
    isInternal: v.boolean(),
    cannedResponseId: v.optional(v.id("ticket_cannedResponses")),
  },
  returns: v.object({ messageId: v.id("ticket_messages"), status: ticketStatusValidator }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const agent = cleanAgent(args.agent);
    const ticket = await loadTicket(ctx, args.ticketId);
    if (ticket.status === "closed") {
      throw new ConvexError({ code: "INVALID_STATE", message: "This ticket is closed. Reopen it to reply." });
    }
    const content = args.content.trim();
    if (content.length < MIN_CONTENT_LENGTH || content.length > MAX_CONTENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `A message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH.toLocaleString("en-US")} characters.`,
      });
    }
    if (args.cannedResponseId) {
      if (args.isInternal) {
        throw new ConvexError({ code: "VALIDATION", message: "Saved replies are for the customer, not internal notes." });
      }
      const saved = await ctx.db.get("ticket_cannedResponses", args.cannedResponseId);
      if (!saved) throw new ConvexError({ code: "NOT_FOUND", message: "That saved reply no longer exists." });
      await ctx.db.patch("ticket_cannedResponses", saved._id, { usageCount: saved.usageCount + 1 });
    }

    const last = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", ticket._id))
      .order("desc")
      .first();
    const now = Date.now();
    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: ticket._id,
      sequence: (last?.sequence ?? -1) + 1,
      senderType: "admin",
      senderRef: agent.ref,
      senderName: agent.name,
      ...(agent.email ? { senderEmail: agent.email } : {}),
      content,
      isInternal: args.isInternal,
      createdAt: now,
    });
    const status = args.isInternal ? ticket.status : statusAfterAgentReply(ticket.status);
    await ctx.db.patch("ticket_tickets", ticket._id, {
      messageCount: ticket.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
      ...(args.isInternal
        ? {}
        : {
            status,
            lastAgentMessageAt: now,
            lastMessageSenderType: "admin" as const,
            ...(ticket.firstResponseAt === undefined ? { firstResponseAt: now } : {}),
          }),
    });
    await emitEvent(ctx, TICKET_EVENTS.REPLIED, SYSTEM.TICKET, {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      messageId,
      senderType: "admin",
      senderId: null,
      senderRef: agent.ref,
      isInternal: args.isInternal,
      ticketOwnerId: ticket.userId,
      assignedTo: ticket.assignedTo ?? null,
    });
    return { messageId, status };
  },
});

/**
 * Move a ticket along OPERATOR_STATUS_TRANSITIONS. Resolving records when;
 * closing records when (and resolves it, if nobody had); reopening clears both.
 */
export const setStatus = internalMutation({
  args: { ticketId: v.id("ticket_tickets"), agent: operatorAgentValidator, status: ticketStatusValidator },
  returns: v.object({ status: ticketStatusValidator, changed: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const agent = cleanAgent(args.agent);
    const ticket = await loadTicket(ctx, args.ticketId);
    if (ticket.status === args.status) return { status: ticket.status, changed: false };
    if (!OPERATOR_STATUS_TRANSITIONS[ticket.status].includes(args.status)) {
      throw new ConvexError({ code: "INVALID_STATE", message: `A ${ticket.status} ticket can't be moved to ${args.status}.` });
    }
    const now = Date.now();
    const reopening = args.status === "open" && (ticket.status === "resolved" || ticket.status === "closed");
    await ctx.db.patch("ticket_tickets", ticket._id, {
      status: args.status,
      updatedAt: now,
      ...(args.status === "resolved" ? { resolvedAt: now } : {}),
      ...(args.status === "closed" ? { closedAt: now, resolvedAt: ticket.resolvedAt ?? now } : {}),
      ...(reopening ? { resolvedAt: undefined, closedAt: undefined } : {}),
    });
    await emitEvent(
      ctx,
      args.status === "resolved" ? TICKET_EVENTS.RESOLVED : args.status === "closed" ? TICKET_EVENTS.CLOSED : TICKET_EVENTS.STATUS_CHANGED,
      SYSTEM.TICKET,
      {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        previousStatus: ticket.status,
        newStatus: args.status,
        changedBy: null,
        changedByRef: agent.ref,
        ticketOwnerId: ticket.userId,
      },
    );
    return { status: args.status, changed: true };
  },
});

/** The agent takes the ticket (an open ticket moves to in progress), or lets it go. */
export const assign = internalMutation({
  args: { ticketId: v.id("ticket_tickets"), agent: operatorAgentValidator, take: v.boolean() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const agent = cleanAgent(args.agent);
    const ticket = await loadTicket(ctx, args.ticketId);
    const theirs = ticket.assignedAgent?.ref === agent.ref;
    if (args.take ? theirs && ticket.assignedAgent?.name === agent.name : !theirs) return { changed: false };
    const now = Date.now();
    await ctx.db.patch("ticket_tickets", ticket._id, {
      assignedTo: undefined,
      assignedAgent: args.take ? { ref: agent.ref, name: agent.name } : undefined,
      assignedAt: args.take ? now : undefined,
      updatedAt: now,
      ...(args.take && ticket.status === "open" ? { status: "inProgress" as const } : {}),
    });
    await emitEvent(ctx, TICKET_EVENTS.ASSIGNED, SYSTEM.TICKET, {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      assignedTo: null,
      assignedAgentRef: args.take ? agent.ref : null,
      changedByRef: agent.ref,
      previousAssignee: ticket.assignedTo ?? ticket.assignedAgent?.ref ?? null,
    });
    return { changed: true };
  },
});

// ─── Settings and saved replies ─────────────────────────────────────────────

export const getSettings = internalQuery({
  args: {},
  returns: ticketSettingsValidator,
  handler: async (ctx) => {
    await requirePluginEnabled(ctx, "tickets");
    return await readTicketSettings(ctx);
  },
});

export const updateSettings = internalMutation({
  args: { agent: operatorAgentValidator, ...ticketSettingsArgs },
  returns: v.object({ updatedSections: v.array(v.string()) }),
  handler: async (ctx, { agent, ...update }) => {
    await requirePluginEnabled(ctx, "tickets");
    return { updatedSections: await writeTicketSettings(ctx, update, { ref: cleanAgent(agent).ref }) };
  },
});

export const operatorCannedResponseRowValidator = v.object({
  id: v.id("ticket_cannedResponses"),
  title: v.string(),
  shortcut: v.string(),
  content: v.string(),
  category: v.string(),
  usageCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Saved replies, most used first. */
export const listCannedResponses = internalQuery({
  args: {},
  returns: v.array(operatorCannedResponseRowValidator),
  handler: async (ctx) => {
    await requirePluginEnabled(ctx, "tickets");
    const rows = await ctx.db.query("ticket_cannedResponses").take(500);
    return rows
      .sort((a, b) => b.usageCount - a.usageCount || a.title.localeCompare(b.title))
      .map((row) => ({
        id: row._id,
        title: row.title,
        shortcut: row.shortcut,
        content: row.content,
        category: row.category,
        usageCount: row.usageCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

function bounded(value: string, label: string, max: number): string {
  const clean = value.trim();
  if (clean.length === 0 || clean.length > max) {
    throw new ConvexError({ code: "VALIDATION", message: `${label} must be between 1 and ${max.toLocaleString("en-US")} characters.` });
  }
  return clean;
}

/** Create a saved reply, or change one (`id`). Shortcuts are unique. */
export const saveCannedResponse = internalMutation({
  args: {
    agent: operatorAgentValidator,
    id: v.optional(v.id("ticket_cannedResponses")),
    title: v.string(),
    shortcut: v.string(),
    content: v.string(),
    category: v.string(),
  },
  returns: v.object({ id: v.id("ticket_cannedResponses") }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const agent = cleanAgent(args.agent);
    const fields = {
      title: bounded(args.title, "A title", MAX_CANNED_TITLE_LENGTH),
      shortcut: bounded(args.shortcut, "A shortcut", MAX_CANNED_SHORTCUT_LENGTH),
      content: bounded(args.content, "The reply", MAX_CANNED_CONTENT_LENGTH),
      category: args.category.trim(),
    };
    const taken = await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_shortcut", (q) => q.eq("shortcut", fields.shortcut))
      .first();
    if (taken && taken._id !== args.id) {
      throw new ConvexError({ code: "CONFLICT", message: `The shortcut "${fields.shortcut}" is already in use.` });
    }
    const now = Date.now();
    if (args.id) {
      const existing = await ctx.db.get("ticket_cannedResponses", args.id);
      if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "That saved reply no longer exists." });
      await ctx.db.patch("ticket_cannedResponses", args.id, { ...fields, updatedAt: now });
      return { id: args.id };
    }
    const id = await ctx.db.insert("ticket_cannedResponses", {
      ...fields,
      usageCount: 0,
      createdByRef: agent.ref,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const removeCannedResponse = internalMutation({
  args: { id: v.id("ticket_cannedResponses") },
  returns: v.object({ removed: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const existing = await ctx.db.get("ticket_cannedResponses", args.id);
    if (!existing) return { removed: false };
    await ctx.db.delete("ticket_cannedResponses", args.id);
    return { removed: true };
  },
});

// ─── The queue's figures ────────────────────────────────────────────────────

const DEFAULT_RECORD_LIMIT = 3_000;
const MAX_RECORD_LIMIT = 5_000;
const MINUTE = 60_000;
const ACTIVE: readonly TicketStatus[] = ["open", "inProgress", "awaitingResponse"];

export const operatorStatsValidator = v.object({
  totalTickets: v.number(),
  statusCounts: v.object({
    open: v.number(),
    inProgress: v.number(),
    awaitingResponse: v.number(),
    resolved: v.number(),
    closed: v.number(),
  }),
  /** Active (not resolved or closed) tickets marked urgent. */
  urgentActive: v.number(),
  /** Active tickets nobody has taken. */
  unassignedActive: v.number(),
  averageFirstResponseMinutes: v.optional(v.number()),
  averageResolutionMinutes: v.optional(v.number()),
  /** Share of tickets answered within the first-response target, counting those still waiting past it as missed. */
  firstResponseTargetPercent: v.optional(v.number()),
  /** Share of tickets resolved within the resolution target, counting open ones past it as missed. */
  resolutionTargetPercent: v.optional(v.number()),
  firstResponseTargetMinutes: v.number(),
  resolutionTargetMinutes: v.number(),
  categoryCounts: v.array(v.object({ category: ticketCategoryValidator, label: v.string(), count: v.number() })),
  /** True when there are more tickets than `recordLimit`: the figures cover the newest ones, created since `windowStartAt`. */
  recordsCapped: v.boolean(),
  recordLimit: v.number(),
  windowStartAt: v.optional(v.number()),
});

type TargetTally = { met: number; missed: number };

function tally(target: number, elapsed: number | undefined, waited: number): "met" | "missed" | null {
  if (elapsed !== undefined) return elapsed <= target ? "met" : "missed";
  return waited > target ? "missed" : null;
}

const percent = ({ met, missed }: TargetTally) => (met + missed > 0 ? Math.round((met / (met + missed)) * 100) : undefined);
const average = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined);

/** Counts, response and resolution times against the targets, and categories, over the newest `recordLimit` tickets. */
export const queueStats = internalQuery({
  args: { recordLimit: v.optional(v.number()) },
  returns: operatorStatsValidator,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const recordLimit = Math.max(1, Math.min(MAX_RECORD_LIMIT, Math.floor(args.recordLimit ?? DEFAULT_RECORD_LIMIT)));
    const rows = await ctx.db.query("ticket_tickets").withIndex("by_created").order("desc").take(recordLimit + 1);
    const recordsCapped = rows.length > recordLimit;
    const tickets = rows.slice(0, recordLimit);
    const { sla } = await readTicketSettings(ctx);
    const labels = await categoryLabels(ctx);
    const now = Date.now();

    const statusCounts = { open: 0, inProgress: 0, awaitingResponse: 0, resolved: 0, closed: 0 };
    const categories = new Map<Ticket["category"], number>();
    const firstResponses: number[] = [];
    const resolutions: number[] = [];
    const firstTally: TargetTally = { met: 0, missed: 0 };
    const resolutionTally: TargetTally = { met: 0, missed: 0 };
    let urgentActive = 0;
    let unassignedActive = 0;
    for (const ticket of tickets) {
      statusCounts[ticket.status] += 1;
      categories.set(ticket.category, (categories.get(ticket.category) ?? 0) + 1);
      const active = ACTIVE.includes(ticket.status);
      if (active && ticket.priority === "urgent") urgentActive += 1;
      if (active && !isAssigned(ticket)) unassignedActive += 1;

      const firstResponse = ticket.firstResponseAt !== undefined ? (ticket.firstResponseAt - ticket.createdAt) / MINUTE : undefined;
      if (firstResponse !== undefined) firstResponses.push(firstResponse);
      const firstOutcome = tally(sla.firstResponseTarget, firstResponse, (now - ticket.createdAt) / MINUTE);
      if (firstOutcome) firstTally[firstOutcome] += 1;

      const resolution = ticket.resolvedAt !== undefined ? (ticket.resolvedAt - ticket.createdAt) / MINUTE : undefined;
      if (resolution !== undefined) resolutions.push(resolution);
      const resolutionOutcome = tally(sla.resolutionTarget, resolution, active ? (now - ticket.createdAt) / MINUTE : 0);
      if (resolutionOutcome) resolutionTally[resolutionOutcome] += 1;
    }
    const averageFirstResponseMinutes = average(firstResponses);
    const averageResolutionMinutes = average(resolutions);
    const firstResponseTargetPercent = percent(firstTally);
    const resolutionTargetPercent = percent(resolutionTally);
    const oldest = tickets[tickets.length - 1];
    return {
      totalTickets: tickets.length,
      statusCounts,
      urgentActive,
      unassignedActive,
      ...(averageFirstResponseMinutes !== undefined ? { averageFirstResponseMinutes } : {}),
      ...(averageResolutionMinutes !== undefined ? { averageResolutionMinutes } : {}),
      ...(firstResponseTargetPercent !== undefined ? { firstResponseTargetPercent } : {}),
      ...(resolutionTargetPercent !== undefined ? { resolutionTargetPercent } : {}),
      firstResponseTargetMinutes: sla.firstResponseTarget,
      resolutionTargetMinutes: sla.resolutionTarget,
      categoryCounts: [...categories.entries()]
        .map(([category, count]) => ({ category, label: labels.get(category) ?? category, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      recordsCapped,
      recordLimit,
      ...(recordsCapped && oldest ? { windowStartAt: oldest.createdAt } : {}),
    };
  },
});
