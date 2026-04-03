/**
 * Ticket System - Shared Argument Validators
 *
 * Reusable Convex validators for ticket mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  ticketCategoryValidator,
  ticketStatusValidator,
  ticketPriorityValidator,
  ticketSourceValidator,
  messageSenderTypeValidator,
  rateLimitActionValidator,
  attachmentValidator,
} from "../schema/tickets";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export {
  ticketCategoryValidator,
  ticketStatusValidator,
  ticketPriorityValidator,
  ticketSourceValidator,
  messageSenderTypeValidator,
  rateLimitActionValidator,
  attachmentValidator,
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum subject length in characters. */
export const MAX_SUBJECT_LENGTH = 200;

/** Minimum subject length in characters. */
export const MIN_SUBJECT_LENGTH = 5;

/** Maximum description/message content length in characters. */
export const MAX_CONTENT_LENGTH = 10000;

/** Minimum description/message content length in characters. */
export const MIN_CONTENT_LENGTH = 10;

/** Maximum tag length in characters. */
export const MAX_TAG_LENGTH = 50;

/** Maximum number of tags per ticket. */
export const MAX_TAGS = 10;

/** Maximum attachments per message. */
export const MAX_ATTACHMENTS = 5;

/** Maximum rating comment length in characters. */
export const MAX_RATING_COMMENT_LENGTH = 1000;

/** Maximum canned response title length. */
export const MAX_CANNED_TITLE_LENGTH = 100;

/** Maximum canned response shortcut length. */
export const MAX_CANNED_SHORTCUT_LENGTH = 50;

/** Maximum canned response content length. */
export const MAX_CANNED_CONTENT_LENGTH = 5000;

/** Default items per page for admin ticket listings. */
export const DEFAULT_PER_PAGE = 20;

/** Maximum items per page. */
export const MAX_PER_PAGE = 100;

/** User message edit window in milliseconds (15 minutes). */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Session TTL in milliseconds (24 hours). */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Rate limit windows in milliseconds. */
export const RATE_LIMIT_WINDOWS = {
  aiQuery: 60 * 1000, // 1 minute
  ticketCreate: 5 * 60 * 1000, // 5 minutes
  search: 10 * 1000, // 10 seconds
} as const;

/** Rate limit max requests per window. */
export const RATE_LIMIT_MAX = {
  aiQuery: 5,
  ticketCreate: 3,
  search: 10,
} as const;

// ─── Ticket Mutation Args ──────────────────────────────────────────────────

/** Arguments for creating a new ticket. */
export const createTicketArgs = {
  subject: v.string(),
  description: v.string(),
  category: ticketCategoryValidator,
  priority: v.optional(ticketPriorityValidator),
  source: v.optional(ticketSourceValidator),
  tags: v.optional(v.array(v.string())),
  aiAttempted: v.optional(v.boolean()),
  aiQuery: v.optional(v.string()),
  aiResponse: v.optional(v.string()),
  kbArticlesShown: v.optional(v.array(v.string())),
};

/** Arguments for a user replying to their own ticket. */
export const replyTicketArgs = {
  ticketId: v.id("ticket_tickets"),
  content: v.string(),
  attachments: v.optional(v.array(attachmentValidator)),
};

/** Arguments for an admin replying to a ticket. */
export const adminReplyArgs = {
  ticketId: v.id("ticket_tickets"),
  content: v.string(),
  isInternal: v.optional(v.boolean()),
  attachments: v.optional(v.array(attachmentValidator)),
};

/** Arguments for updating ticket status. */
export const updateStatusArgs = {
  ticketId: v.id("ticket_tickets"),
  status: ticketStatusValidator,
};

/** Arguments for updating ticket priority. */
export const updatePriorityArgs = {
  ticketId: v.id("ticket_tickets"),
  priority: ticketPriorityValidator,
};

/** Arguments for assigning a ticket. */
export const assignTicketArgs = {
  ticketId: v.id("ticket_tickets"),
  assigneeId: v.id("users"),
};

/** Arguments for unassigning a ticket. */
export const unassignTicketArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for closing a ticket. */
export const closeTicketArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for reopening a ticket. */
export const reopenTicketArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for rating a ticket (CSAT). */
export const rateTicketArgs = {
  ticketId: v.id("ticket_tickets"),
  rating: v.number(), // 1-5
  comment: v.optional(v.string()),
};

/** Arguments for adding tags to a ticket. */
export const addTagsArgs = {
  ticketId: v.id("ticket_tickets"),
  tags: v.array(v.string()),
};

/** Arguments for removing tags from a ticket. */
export const removeTagsArgs = {
  ticketId: v.id("ticket_tickets"),
  tags: v.array(v.string()),
};

// ─── Message Mutation Args ─────────────────────────────────────────────────

/** Arguments for editing a message. */
export const editMessageArgs = {
  messageId: v.id("ticket_messages"),
  content: v.string(),
};

/** Arguments for removing a message. */
export const removeMessageArgs = {
  messageId: v.id("ticket_messages"),
};

/** Arguments for adding an internal note. */
export const addInternalNoteArgs = {
  ticketId: v.id("ticket_tickets"),
  content: v.string(),
  attachments: v.optional(v.array(attachmentValidator)),
};

/** Arguments for adding a system message. */
export const addSystemMessageArgs = {
  ticketId: v.id("ticket_tickets"),
  content: v.string(),
};

// ─── Canned Response Args ──────────────────────────────────────────────────

/** Arguments for creating a canned response. */
export const createCannedResponseArgs = {
  title: v.string(),
  shortcut: v.string(),
  content: v.string(),
  category: v.string(),
};

/** Arguments for updating a canned response. */
export const updateCannedResponseArgs = {
  id: v.id("ticket_cannedResponses"),
  title: v.optional(v.string()),
  shortcut: v.optional(v.string()),
  content: v.optional(v.string()),
  category: v.optional(v.string()),
};

/** Arguments for removing a canned response. */
export const removeCannedResponseArgs = {
  id: v.id("ticket_cannedResponses"),
};

/** Arguments for searching canned responses. */
export const searchCannedResponsesArgs = {
  query: v.string(),
  category: v.optional(v.string()),
};

/** Arguments for applying a template with variable substitution. */
export const applyTemplateArgs = {
  id: v.id("ticket_cannedResponses"),
  ticketId: v.id("ticket_tickets"),
};

// ─── Session Args ──────────────────────────────────────────────────────────

/** Arguments for creating a session. */
export const createSessionArgs = {
  sessionId: v.string(),
};

/** Arguments for validating a session. */
export const validateSessionArgs = {
  sessionId: v.string(),
};

/** Arguments for touching a session (updating lastActivityAt). */
export const touchSessionArgs = {
  sessionId: v.string(),
};

/** Arguments for associating a user with a session. */
export const associateUserArgs = {
  sessionId: v.string(),
  userId: v.id("users"),
};

/** Arguments for invalidating a session. */
export const invalidateSessionArgs = {
  sessionId: v.string(),
};

// ─── Rate Limit Args ───────────────────────────────────────────────────────

/** Arguments for checking and recording a rate limit. */
export const checkRateLimitArgs = {
  sessionId: v.string(),
  action: rateLimitActionValidator,
  userId: v.optional(v.string()),
};

/** Arguments for getting rate limit status. */
export const getRateLimitStatusArgs = {
  sessionId: v.string(),
  action: rateLimitActionValidator,
};

// ─── Query Args ────────────────────────────────────────────────────────────

/** Arguments for getting a user's own tickets. */
export const getMyTicketsArgs = {
  status: v.optional(ticketStatusValidator),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/** Arguments for getting a ticket by ticket number. */
export const getByTicketNumberArgs = {
  ticketNumber: v.string(),
};

/** Arguments for getting a ticket by ID. */
export const getByIdArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for getting a ticket with all its replies. */
export const getTicketWithRepliesArgs = {
  ticketId: v.id("ticket_tickets"),
  includeInternal: v.optional(v.boolean()),
};

/** Arguments for the admin ticket queue with filters. */
export const getQueueArgs = {
  status: v.optional(ticketStatusValidator),
  priority: v.optional(ticketPriorityValidator),
  category: v.optional(ticketCategoryValidator),
  assignedTo: v.optional(v.id("users")),
  unassigned: v.optional(v.boolean()),
  search: v.optional(v.string()),
  orderBy: v.optional(
    v.union(
      v.literal("createdAt"),
      v.literal("updatedAt"),
      v.literal("priority"),
      v.literal("lastMessageAt"),
    ),
  ),
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/** Arguments for getting messages by ticket. */
export const getMessagesByTicketArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for getting public messages by ticket (no internal notes). */
export const getPublicMessagesByTicketArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for getting message count. */
export const getMessageCountArgs = {
  ticketId: v.id("ticket_tickets"),
};

/** Arguments for recent tickets query. */
export const getRecentArgs = {
  limit: v.optional(v.number()),
};

/** Arguments for tickets awaiting first response. */
export const getAwaitingFirstResponseArgs = {
  limit: v.optional(v.number()),
};
