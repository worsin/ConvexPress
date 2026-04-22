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
} from "../helpers/permissions";
import {
  getMyTicketsArgs,
  getByTicketNumberArgs,
  getByIdArgs,
  getTicketWithRepliesArgs,
  getQueueArgs,
  getRecentArgs,
  getAwaitingFirstResponseArgs,
} from "./validators";
import { isPluginEnabled } from "../helpers/plugins";

// ─── getMyTickets ───────────────────────────────────────────────────────────

/**
 * Get the current user's own tickets (paginated, filterable by status).
 * For the website "My Tickets" page.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getMyTickets = query({
  args: getMyTicketsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return { page: [], isDone: true, continueCursor: "" };
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Use Convex-native pagination via by_user index.
    // Status is filtered in-memory after pagination since there is no compound
    // by_user_status index. The page boundary is applied by Convex automatically.
    const result = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const tickets = args.status
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      ? result.page.filter((t) => t.status === args.status)
      : result.page;

    return {
      ...result,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      page: tickets.map((t) => ({
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
    };
  },
});

// ─── getByTicketNumber ──────────────────────────────────────────────────────

/**
 * Lookup a ticket by its human-readable ticket number (e.g., "TKT-202604-00001").
 * Users can see their own tickets; staff with ticket.viewAll see any ticket.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getByTicketNumber = query({
  args: getByTicketNumberArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_ticket_number", (q: ConvexQueryBuilder) =>
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getById = query({
  args: getByIdArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db.get("ticket_tickets", args.ticketId);
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getTicketWithReplies = query({
  args: getTicketWithRepliesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db.get("ticket_tickets", args.ticketId);
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
      .withIndex("by_ticket_sequence", (q: ConvexQueryBuilder) => q.eq("ticketId", args.ticketId))
      .take(1000);

    const messages = canViewInternal
      ? allMessages
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      : allMessages.filter((m) => !m.isInternal);

    // Resolve assignee name if assigned
    let assigneeName: string | undefined;
    if (ticket.assignedTo) {
      const assignee = await ctx.db.get("users", ticket.assignedTo);
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getQueue = query({
  args: getQueueArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return { total: 0, page: 1, perPage: 0, totalPages: 0, tickets: [] };
    const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
    if (!canViewAll) return null;

    const orderDir = args.orderDir ?? "desc";
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 25));

    // Bound the in-memory result set. With filtering + sort done after the
    // index scan, we collect up to MAX_SCAN rows and slice for the page.
    const MAX_SCAN = 5000;

    let scanned;

    if (args.status && args.priority) {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_status_priority", (q: ConvexQueryBuilder) =>
          q.eq("status", args.status!).eq("priority", args.priority!),
        )
        .order(orderDir === "desc" ? "desc" : "asc")
        .take(MAX_SCAN);
    } else if (args.assignedTo && args.status) {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_assigned_status", (q: ConvexQueryBuilder) =>
          q.eq("assignedTo", args.assignedTo!).eq("status", args.status!),
        )
        .order(orderDir === "desc" ? "desc" : "asc")
        .take(MAX_SCAN);
    } else if (args.status) {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", args.status!))
        .order(orderDir === "desc" ? "desc" : "asc")
        .take(MAX_SCAN);
    } else if (args.priority) {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_priority", (q: ConvexQueryBuilder) => q.eq("priority", args.priority!))
        .order(orderDir === "desc" ? "desc" : "asc")
        .take(MAX_SCAN);
    } else if (args.assignedTo) {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_assigned", (q: ConvexQueryBuilder) => q.eq("assignedTo", args.assignedTo!))
        .order(orderDir === "desc" ? "desc" : "asc")
        .take(MAX_SCAN);
    } else if (args.category) {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_category", (q: ConvexQueryBuilder) => q.eq("category", args.category!))
        .order(orderDir === "desc" ? "desc" : "asc")
        .take(MAX_SCAN);
    } else {
      scanned = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_created")
        .order("desc")
        .take(MAX_SCAN);
    }

    // ── In-memory filters across the full scanned set ───────────────────

    let tickets = scanned;

    if (args.unassigned) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      tickets = tickets.filter((t) => !t.assignedTo);
    }

    // Filter by category when it wasn't used as the primary index
    if (args.category && (args.status || args.priority || args.assignedTo)) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      tickets = tickets.filter((t) => t.category === args.category);
    }

    // Text search on subject / ticket number / user name
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      tickets = tickets.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (t) =>
          t.subject.toLowerCase().includes(searchLower) ||
          t.ticketNumber.toLowerCase().includes(searchLower) ||
          t.userNameSnapshot.toLowerCase().includes(searchLower),
      );
    }

    // ── Secondary sort (only when orderBy differs from index order) ─────
    const orderBy = args.orderBy ?? "createdAt";
    if (orderBy !== "createdAt") {
      type TicketPriority = "urgent" | "high" | "medium" | "low";
      const priorityOrder: Record<TicketPriority, number> = {
        urgent: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      tickets.sort((a, b) => {
        let cmp = 0;
        if (orderBy === "priority") {
          cmp =
            priorityOrder[a.priority as TicketPriority] -
            priorityOrder[b.priority as TicketPriority];
        } else if (orderBy === "lastMessageAt") {
          cmp = (a.lastMessageAt ?? 0) - (b.lastMessageAt ?? 0);
        } else if (orderBy === "updatedAt") {
          cmp = a.updatedAt - b.updatedAt;
        }
        return orderDir === "desc" ? -cmp : cmp;
      });
    }

    // ── Slice for the requested page ────────────────────────────────────
    const total = tickets.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    const pageTickets = tickets.slice(start, start + perPage);

    // ── Resolve assignee names (only for the visible page) ──────────────
    const assigneeIds = [
      ...new Set(
        pageTickets
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          .map((t) => t.assignedTo)
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
      total,
      page,
      perPage,
      totalPages,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
    };
  },
});

// ─── getStats ───────────────────────────────────────────────────────────────

/**
 * Ticket statistics for the admin dashboard.
 * Returns counts by status, average response times, SLA compliance, and CSAT.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getStats = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
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
      // Safety-bounded with .take(10000) to avoid unbounded memory usage
      const tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", status))
        .take(10000);
      counts[status] = tickets.length;
    }

    // Count by priority (open tickets only).
    // Bound with .take() to avoid full table scans on large deployments.
    const priorities = ["low", "medium", "high", "urgent"] as const;
    const priorityCounts: Record<string, number> = {};
    const openTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "open"))
      .take(5000);
    const inProgressTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "inProgress"))
      .take(5000);
    const activeTickets = [...openTickets, ...inProgressTickets];

    for (const priority of priorities) {
      priorityCounts[priority] = activeTickets.filter(
        (t) => t.priority === priority,
      ).length;
    }

    // Average first response time (last 30 days, resolved/closed tickets).
    // Use .take() to bound the scan; 2000 tickets per status is a generous
    // ceiling that avoids a full table scan while keeping metrics accurate
    // for all but extremely high-volume deployments.
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const resolvedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "resolved"))
      .take(2000);
    const closedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "closed"))
      .take(2000);

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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRecent = query({
  args: getRecentArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return [];
    const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
    if (!canViewAll) return null;

    const limit = args.limit ?? 10;

    const tickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getAwaitingFirstResponse = query({
  args: getAwaitingFirstResponseArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return [];
    const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
    if (!canViewAll) return null;

    const limit = args.limit ?? 20;

    // Get open and inProgress tickets without a first response.
    // Use .take(100) per status as a safety bound — SLA dashboards are only
    // interested in the oldest N tickets, not an exhaustive list.
    const openTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "open"))
      .take(100);
    const inProgressTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "inProgress"))
      .take(100);

    const awaitingResponse = [...openTickets, ...inProgressTickets]
      .filter((t) => !t.firstResponseAt)
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
