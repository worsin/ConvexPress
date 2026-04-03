/**
 * Ticket System - Queries
 *
 * All read operations for tickets:
 *   getMyTickets              - User's own tickets (paginated, filterable by status)
 *   getByTicketNumber         - Lookup by human-readable ticket number
 *   getById                   - Lookup by Convex ID
 *   getTicketWithReplies      - Full ticket detail with all messages
 *   getQueue                  - Admin ticket queue (filtered, paginated)
 *   getStats                  - Ticket stats dashboard data
 *   getRecent                 - Recent tickets for dashboard widget
 *   getAwaitingFirstResponse  - Tickets with no admin response yet (SLA tracking)
 *
 * Authorization:
 *   - getMyTickets, getByTicketNumber, getById, getTicketWithReplies: authenticated
 *     users can see their own tickets; staff with ticket.viewAll see all
 *   - getQueue, getStats, getRecent, getAwaitingFirstResponse: ticket.viewAll required
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import {
  getCurrentUser,
  currentUserCan,
  requireAuth,
} from "../helpers/permissions";
import {
  getMyTicketsArgs,
  getByTicketNumberArgs,
  getByIdArgs,
  getTicketWithRepliesArgs,
  getQueueArgs,
  getRecentArgs,
  getAwaitingFirstResponseArgs,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
} from "./validators";

// ─── getMyTickets ───────────────────────────────────────────────────────────

/**
 * Get the current user's own tickets (paginated, filterable by status).
 * For the website "My Tickets" page.
 */
export const getMyTickets = query({
  args: getMyTicketsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE));

    // Query user's tickets
    let tickets;
    if (args.status) {
      // Get all for this user, then filter by status
      // (no compound index on userId + status, so filter in-memory)
      const allUserTickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      tickets = allUserTickets.filter((t) => t.status === args.status);
    } else {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    }

    // Sort by createdAt descending (most recent first)
    tickets.sort((a, b) => b.createdAt - a.createdAt);

    // Paginate
    const total = tickets.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const pageTickets = tickets.slice(offset, offset + perPage);

    return {
      tickets: pageTickets.map((t) => ({
        _id: t._id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        messageCount: t.messageCount,
        lastMessageAt: t.lastMessageAt,
        createdAt: t.createdAt,
        rating: t.rating,
      })),
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── getByTicketNumber ──────────────────────────────────────────────────────

/**
 * Lookup a ticket by its human-readable ticket number (e.g., "TKT-202604-00001").
 * Users can see their own tickets; staff with ticket.viewAll see any ticket.
 */
export const getByTicketNumber = query({
  args: getByTicketNumberArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_ticket_number", (q) =>
        q.eq("ticketNumber", args.ticketNumber),
      )
      .unique();

    if (!ticket) return null;

    // Access check: own ticket or ticket.viewAll
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    return ticket;
  },
});

// ─── getById ────────────────────────────────────────────────────────────────

/**
 * Lookup a ticket by Convex document ID.
 * Users can see their own tickets; staff with ticket.viewAll see any ticket.
 */
export const getById = query({
  args: getByIdArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    // Access check
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    return ticket;
  },
});

// ─── getTicketWithReplies ───────────────────────────────────────────────────

/**
 * Get a ticket with all its messages (full thread).
 * Internal notes are included only if the user has ticket.viewInternalNotes.
 * Messages are ordered by sequence number.
 */
export const getTicketWithReplies = query({
  args: getTicketWithRepliesArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    // Access check
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    // Determine if internal notes should be shown
    const canViewInternal =
      args.includeInternal !== false &&
      (await currentUserCan(ctx, "ticket.viewInternalNotes"));

    // Fetch messages ordered by sequence
    const allMessages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const messages = canViewInternal
      ? allMessages
      : allMessages.filter((m) => !m.isInternal);

    // Resolve assignee name if assigned
    let assigneeName: string | undefined;
    if (ticket.assignedTo) {
      const assignee = await ctx.db.get(ticket.assignedTo);
      if (assignee) {
        assigneeName =
          assignee.displayName ||
          [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") ||
          assignee.email;
      }
    }

    return {
      ticket: {
        ...ticket,
        assigneeName,
      },
      messages,
    };
  },
});

// ─── getQueue (Admin) ───────────────────────────────────────────────────────

/**
 * Admin ticket queue with filtering, sorting, and pagination.
 *
 * Supports filtering by:
 *   - status, priority, category, assignedTo, unassigned
 *   - text search (subject match)
 *
 * Sorting by: createdAt, updatedAt, priority, lastMessageAt
 */
export const getQueue = query({
  args: getQueueArgs,
  handler: async (ctx, args) => {
    const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
    if (!canViewAll) return null;

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE));
    const orderDir = args.orderDir ?? "desc";

    // ── Fetch tickets using the best available index ────────────────────
    let tickets;

    if (args.status && args.priority) {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_status_priority", (q) =>
          q.eq("status", args.status!).eq("priority", args.priority!),
        )
        .collect();
    } else if (args.assignedTo && args.status) {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_assigned_status", (q) =>
          q.eq("assignedTo", args.assignedTo!).eq("status", args.status!),
        )
        .collect();
    } else if (args.status) {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.priority) {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_priority", (q) => q.eq("priority", args.priority!))
        .collect();
    } else if (args.assignedTo) {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_assigned", (q) => q.eq("assignedTo", args.assignedTo!))
        .collect();
    } else if (args.category) {
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      // All tickets, bounded
      tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_created")
        .order("desc")
        .take(5000);
    }

    // ── In-memory filters ───────────────────────────────────────────────

    // Filter unassigned
    if (args.unassigned) {
      tickets = tickets.filter((t) => !t.assignedTo);
    }

    // Filter by category (if not already filtered by index)
    if (args.category && !(args.status || args.priority || args.assignedTo)) {
      // Already filtered by index above
    } else if (args.category) {
      tickets = tickets.filter((t) => t.category === args.category);
    }

    // Text search on subject
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      tickets = tickets.filter(
        (t) =>
          t.subject.toLowerCase().includes(searchLower) ||
          t.ticketNumber.toLowerCase().includes(searchLower) ||
          t.userNameSnapshot.toLowerCase().includes(searchLower),
      );
    }

    // ── Sort ────────────────────────────────────────────────────────────
    const orderBy = args.orderBy ?? "createdAt";
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

    tickets.sort((a, b) => {
      let cmp = 0;
      if (orderBy === "priority") {
        cmp = priorityOrder[a.priority] - priorityOrder[b.priority];
      } else if (orderBy === "lastMessageAt") {
        cmp = (a.lastMessageAt ?? 0) - (b.lastMessageAt ?? 0);
      } else if (orderBy === "updatedAt") {
        cmp = a.updatedAt - b.updatedAt;
      } else {
        cmp = a.createdAt - b.createdAt;
      }
      return orderDir === "desc" ? -cmp : cmp;
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total = tickets.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const pageTickets = tickets.slice(offset, offset + perPage);

    // ── Resolve assignee names ──────────────────────────────────────────
    const assigneeIds = [
      ...new Set(
        pageTickets
          .map((t) => t.assignedTo)
          .filter((id): id is NonNullable<typeof id> => id != null),
      ),
    ];
    const assigneeMap = new Map<string, string>();
    for (const id of assigneeIds) {
      const assignee = await ctx.db.get(id);
      if (assignee) {
        assigneeMap.set(
          id,
          assignee.displayName ||
            [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") ||
            assignee.email,
        );
      }
    }

    return {
      tickets: pageTickets.map((t) => ({
        _id: t._id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo,
        assigneeName: t.assignedTo
          ? assigneeMap.get(t.assignedTo)
          : undefined,
        userNameSnapshot: t.userNameSnapshot,
        userEmailSnapshot: t.userEmailSnapshot,
        messageCount: t.messageCount,
        lastMessageAt: t.lastMessageAt,
        firstResponseAt: t.firstResponseAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        tags: t.tags,
        rating: t.rating,
      })),
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── getStats ───────────────────────────────────────────────────────────────

/**
 * Ticket statistics for the admin dashboard.
 * Returns counts by status, average response times, SLA compliance, and CSAT.
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const canViewAll = await currentUserCan(ctx, "ticket.viewAnalytics");
    if (!canViewAll) return null;

    // Count by status
    const statuses = [
      "open",
      "awaitingResponse",
      "inProgress",
      "resolved",
      "closed",
    ] as const;
    const counts: Record<string, number> = {};

    for (const status of statuses) {
      const tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      counts[status] = tickets.length;
    }

    // Count by priority (open tickets only)
    const priorities = ["low", "medium", "high", "urgent"] as const;
    const priorityCounts: Record<string, number> = {};
    const openTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const inProgressTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "inProgress"))
      .collect();
    const activeTickets = [...openTickets, ...inProgressTickets];

    for (const priority of priorities) {
      priorityCounts[priority] = activeTickets.filter(
        (t) => t.priority === priority,
      ).length;
    }

    // Average first response time (last 30 days, resolved/closed tickets)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const resolvedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "resolved"))
      .collect();
    const closedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .collect();

    const recentCompleted = [...resolvedTickets, ...closedTickets].filter(
      (t) => t.createdAt >= thirtyDaysAgo && t.firstResponseAt,
    );

    let avgFirstResponseMs = 0;
    if (recentCompleted.length > 0) {
      const totalResponseTime = recentCompleted.reduce(
        (sum, t) => sum + (t.firstResponseAt! - t.createdAt),
        0,
      );
      avgFirstResponseMs = totalResponseTime / recentCompleted.length;
    }

    // Average resolution time (last 30 days)
    const resolvedRecent = recentCompleted.filter((t) => t.resolvedAt);
    let avgResolutionMs = 0;
    if (resolvedRecent.length > 0) {
      const totalResolutionTime = resolvedRecent.reduce(
        (sum, t) => sum + (t.resolvedAt! - t.createdAt),
        0,
      );
      avgResolutionMs = totalResolutionTime / resolvedRecent.length;
    }

    // CSAT average (last 30 days)
    const ratedTickets = [...resolvedTickets, ...closedTickets].filter(
      (t) => t.createdAt >= thirtyDaysAgo && t.rating !== undefined,
    );
    let avgRating = 0;
    if (ratedTickets.length > 0) {
      avgRating =
        ratedTickets.reduce((sum, t) => sum + t.rating!, 0) /
        ratedTickets.length;
    }

    return {
      counts,
      priorityCounts,
      avgFirstResponseMs,
      avgResolutionMs,
      avgRating,
      ratedCount: ratedTickets.length,
      totalActive: activeTickets.length,
    };
  },
});

// ─── getRecent ──────────────────────────────────────────────────────────────

/**
 * Recent tickets for the admin dashboard widget.
 */
export const getRecent = query({
  args: getRecentArgs,
  handler: async (ctx, args) => {
    const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
    if (!canViewAll) return null;

    const limit = args.limit ?? 10;

    const tickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    return tickets.map((t) => ({
      _id: t._id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      userNameSnapshot: t.userNameSnapshot,
      createdAt: t.createdAt,
    }));
  },
});

// ─── getAwaitingFirstResponse ───────────────────────────────────────────────

/**
 * Get tickets that have not received an admin response yet.
 * Used for SLA monitoring -- these are tickets breaching or approaching SLA.
 * Sorted by creation time ascending (oldest first = most urgent).
 */
export const getAwaitingFirstResponse = query({
  args: getAwaitingFirstResponseArgs,
  handler: async (ctx, args) => {
    const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
    if (!canViewAll) return null;

    const limit = args.limit ?? 20;

    // Get open and inProgress tickets without a first response
    const openTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const inProgressTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "inProgress"))
      .collect();

    const awaitingResponse = [...openTickets, ...inProgressTickets]
      .filter((t) => !t.firstResponseAt)
      .sort((a, b) => a.createdAt - b.createdAt) // Oldest first
      .slice(0, limit);

    return awaitingResponse.map((t) => ({
      _id: t._id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      userNameSnapshot: t.userNameSnapshot,
      assignedTo: t.assignedTo,
      createdAt: t.createdAt,
      waitingMs: Date.now() - t.createdAt,
    }));
  },
});
