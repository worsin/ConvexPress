# Ticket System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a production-quality support ticket system for ConvexPress with sequential numbering, threaded messaging, canned responses, CSAT ratings, SLA tracking, and rate limiting.

**Architecture:** Independent Convex module at `convex/schema/tickets.ts` + `convex/tickets/`. Uses shared helpers (permissions, events). Admin UI via TanStack Router, website UI via TanStack Start SSR. Designed for independence -- works without the KB system.

**Tech Stack:** Convex, TanStack Router, TanStack Start, Base UI, Tailwind CSS v4

---

## Task 1: Schema + Hub Integration

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/schema/tickets.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

Six tables: `ticket_tickets`, `ticket_messages`, `ticket_counters`, `ticket_cannedResponses`, `ticket_sessions`, `ticket_rateLimits`. All prefixed `ticket_`. Exports `ticketTables` object.

- [ ] **Step 1: Create the tickets schema file**

Create `ConvexPress-Admin/packages/backend/convex/schema/tickets.ts`:

```typescript
/**
 * Ticket System - Schema
 *
 * Six tables supporting a full support ticket lifecycle:
 *   - `ticket_tickets`          - Primary ticket storage with sequential numbering
 *   - `ticket_messages`         - Threaded messages per ticket with sequence ordering
 *   - `ticket_counters`         - Atomic counters for sequential ticket number generation
 *   - `ticket_cannedResponses`  - Admin canned response templates with variable substitution
 *   - `ticket_sessions`         - Anonymous session tracking for unauthenticated widget users
 *   - `ticket_rateLimits`       - Rate limiting records for AI queries, ticket creation, search
 *
 * Key design decisions:
 *   - ticketNumber is a formatted string "TKT-YYYYMM-XXXXX" for human readability
 *   - User email/name are snapshotted at creation time (not live-resolved)
 *   - Messages use sequence numbers (not timestamps) for guaranteed ordering
 *   - Internal notes are messages with isInternal=true, filtered from user queries
 *   - kbArticlesShown stores article IDs as strings (not Id<"kb_articles">) for
 *     schema independence -- the ticket system works without the KB system
 *   - Attachments reference Convex _storage for file uploads
 *   - Sessions have 24hr TTL with cleanup via cron
 *   - Rate limits are per-session per-action with configurable windows
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const ticketCategoryValidator = v.union(
  v.literal("billing"),
  v.literal("technical"),
  v.literal("account"),
  v.literal("featureRequest"),
  v.literal("general"),
  v.literal("other"),
);

export const ticketStatusValidator = v.union(
  v.literal("open"),
  v.literal("awaitingResponse"),
  v.literal("inProgress"),
  v.literal("resolved"),
  v.literal("closed"),
);

export const ticketPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const ticketSourceValidator = v.union(
  v.literal("widget"),
  v.literal("email"),
  v.literal("dashboard"),
  v.literal("api"),
);

export const messageSenderTypeValidator = v.union(
  v.literal("user"),
  v.literal("admin"),
  v.literal("system"),
  v.literal("ai"),
);

export const rateLimitActionValidator = v.union(
  v.literal("aiQuery"),
  v.literal("ticketCreate"),
  v.literal("search"),
);

export const attachmentValidator = v.object({
  name: v.string(),
  storageId: v.id("_storage"),
  mimeType: v.string(),
  size: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const ticketTables = {
  /**
   * ticket_tickets - Primary ticket storage
   *
   * Each ticket has a human-readable sequential number (TKT-YYYYMM-XXXXX),
   * a snapshot of the user's email/name at creation time, and full lifecycle
   * tracking fields for status transitions, assignment, SLA, and CSAT.
   *
   * The kbArticlesShown field stores article IDs as plain strings rather than
   * Id<"kb_articles"> to maintain schema independence from the KB system.
   */
  ticket_tickets: defineTable({
    // ── Identification ────────────────────────────────────────────────────
    ticketNumber: v.string(), // "TKT-YYYYMM-XXXXX"

    // ── User Context (snapshotted at creation) ────────────────────────────
    userId: v.id("users"),
    userEmailSnapshot: v.string(),
    userNameSnapshot: v.string(),

    // ── Content ───────────────────────────────────────────────────────────
    subject: v.string(),
    description: v.string(),
    category: ticketCategoryValidator,

    // ── Status & Priority ─────────────────────────────────────────────────
    status: ticketStatusValidator,
    priority: ticketPriorityValidator,

    // ── Assignment ────────────────────────────────────────────────────────
    assignedTo: v.optional(v.id("users")),
    assignedAt: v.optional(v.number()),

    // ── Source ─────────────────────────────────────────────────────────────
    source: ticketSourceValidator,

    // ── Tags ──────────────────────────────────────────────────────────────
    tags: v.array(v.string()),

    // ── AI Deflection Context ─────────────────────────────────────────────
    aiAttempted: v.boolean(),
    aiQuery: v.optional(v.string()),
    aiResponse: v.optional(v.string()),
    kbArticlesShown: v.optional(v.array(v.string())), // String IDs for schema independence

    // ── CSAT Rating ───────────────────────────────────────────────────────
    rating: v.optional(v.number()), // 1-5
    ratingComment: v.optional(v.string()),

    // ── Denormalized Counts ───────────────────────────────────────────────
    messageCount: v.number(),

    // ── Lifecycle Timestamps ──────────────────────────────────────────────
    lastMessageAt: v.optional(v.number()),
    firstResponseAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_assigned", ["assignedTo"])
    .index("by_category", ["category"])
    .index("by_ticket_number", ["ticketNumber"])
    .index("by_status_priority", ["status", "priority"])
    .index("by_assigned_status", ["assignedTo", "status", "priority"])
    .index("by_status_priority_created", ["status", "priority", "createdAt"])
    .index("by_created", ["createdAt"])
    .index("by_first_response", ["firstResponseAt", "status"])
    .index("by_last_message", ["lastMessageAt"]),

  /**
   * ticket_messages - Threaded messages per ticket
   *
   * Messages use sequence numbers (not timestamps) for guaranteed ordering.
   * This avoids timestamp collision issues in real-time systems.
   *
   * Internal notes (isInternal=true) are hidden from ticket owners and
   * only visible to users with ticket.viewInternalNotes capability.
   *
   * Attachments reference Convex _storage for secure file access.
   */
  ticket_messages: defineTable({
    // ── Identification ────────────────────────────────────────────────────
    ticketId: v.id("ticket_tickets"),
    sequence: v.number(), // Guaranteed ordering within a ticket

    // ── Sender ────────────────────────────────────────────────────────────
    senderType: messageSenderTypeValidator,
    senderId: v.optional(v.id("users")),
    senderName: v.string(),
    senderEmail: v.optional(v.string()),

    // ── Content ───────────────────────────────────────────────────────────
    content: v.string(), // Markdown
    isInternal: v.boolean(), // Hidden from ticket owner

    // ── Attachments ───────────────────────────────────────────────────────
    attachments: v.optional(v.array(attachmentValidator)),

    // ── Timestamps ────────────────────────────────────────────────────────
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_ticket_time", ["ticketId", "createdAt"])
    .index("by_ticket_sequence", ["ticketId", "sequence"])
    .index("by_sender", ["senderId"]),

  /**
   * ticket_counters - Atomic counters for sequential ticket numbering
   *
   * One document per year-month pair. The counter field is atomically
   * incremented when a new ticket is created. This guarantees unique,
   * monotonically increasing ticket numbers within each month.
   *
   * Format: TKT-{YYYYMM}-{counter padded to 5 digits}
   * Example: TKT-202604-00001
   */
  ticket_counters: defineTable({
    year: v.number(),
    month: v.number(),
    counter: v.number(),
  }).index("by_year_month", ["year", "month"]),

  /**
   * ticket_cannedResponses - Admin canned response templates
   *
   * Templates support {{variable}} substitution for common fields:
   *   - {{userName}} - Ticket owner's display name
   *   - {{ticketNumber}} - The ticket number string
   *   - {{category}} - Ticket category label
   *
   * Admin types a shortcut (e.g., "/refund") in the reply box to insert
   * the template content. Usage count is incremented for analytics.
   */
  ticket_cannedResponses: defineTable({
    title: v.string(),
    shortcut: v.string(), // e.g., "/refund"
    content: v.string(), // Supports {{variable}} substitution
    category: v.string(),
    usageCount: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shortcut", ["shortcut"])
    .index("by_category", ["category"]),

  /**
   * ticket_sessions - Anonymous session tracking
   *
   * For the floating support widget, users may interact before authenticating.
   * Sessions track anonymous activity and can be associated with a user once
   * they log in. 24-hour TTL, cleaned up by cron.
   */
  ticket_sessions: defineTable({
    sessionId: v.string(), // Crypto-random string
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    expiresAt: v.number(), // 24hr TTL
    lastActivityAt: v.number(),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_expires", ["expiresAt"])
    .index("by_user", ["userId"]),

  /**
   * ticket_rateLimits - Rate limiting records
   *
   * Per-session, per-action rate limiting for:
   *   - aiQuery: AI deflection queries (prevent abuse)
   *   - ticketCreate: Ticket creation (prevent spam)
   *   - search: Search queries (prevent abuse)
   *
   * Records are cleaned up periodically by cron.
   */
  ticket_rateLimits: defineTable({
    sessionId: v.string(),
    action: rateLimitActionValidator,
    userId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session_action", ["sessionId", "action"])
    .index("by_action_time", ["action", "createdAt"])
    .index("by_created", ["createdAt"]),
};
```

- [ ] **Step 2: Import and spread in schema.ts**

Modify `ConvexPress-Admin/packages/backend/convex/schema.ts`. Add the import alongside the other schema imports, and spread it into the `defineSchema` call.

Add this import after the existing imports (e.g., after `import { analyticsTables } from "./schema/analytics";`):

```typescript
import { ticketTables } from "./schema/tickets";
```

Add this spread inside the `defineSchema({})` call (e.g., after `...analyticsTables,`):

```typescript
  ...ticketTables,
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm the schema deploys without errors.

**Commit:** `feat(tickets): add 6 ticket system schema tables with indexes`

---

## Task 2: Event Constants

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/events/constants.ts`

Add the TICKET system slug and all 7 ticket event codes from the design spec.

- [ ] **Step 1: Add system slug**

In `ConvexPress-Admin/packages/backend/convex/events/constants.ts`, add `TICKET: "ticket"` to the `SYSTEM` constant object. Place it after the last existing entry (before `} as const;`):

```typescript
  TICKET: "ticket",
```

- [ ] **Step 2: Add ticket event codes**

After the last event block (e.g., after `DASHBOARD_EVENTS`), add:

```typescript
/** Ticket System events (7) */
export const TICKET_EVENTS = {
  CREATED: "ticket.created",
  REPLIED: "ticket.replied",
  ASSIGNED: "ticket.assigned",
  STATUS_CHANGED: "ticket.status_changed",
  RESOLVED: "ticket.resolved",
  CLOSED: "ticket.closed",
  RATED: "ticket.rated",
} as const;
```

- [ ] **Step 3: Register in ALL_EVENT_CODES**

Add `...Object.values(TICKET_EVENTS),` to the `ALL_EVENT_CODES` array, after the last existing spread:

```typescript
  ...Object.values(TICKET_EVENTS),
```

- [ ] **Step 4: Register in EVENT_CODES_BY_SYSTEM**

Add the ticket system entry to the `EVENT_CODES_BY_SYSTEM` record, after the last existing entry:

```typescript
  [SYSTEM.TICKET]: Object.values(TICKET_EVENTS),
```

- [ ] **Step 5: Add ticket events to retention tiers**

Add the following ticket event codes to the appropriate retention tier sets:

In `CRITICAL_RETENTION_CODES` (365 days), add:
```typescript
  // Ticket events (compliance/support audit trail)
  TICKET_EVENTS.CLOSED,
```

In `SHORT_RETENTION_CODES` (30 days), add:
```typescript
  TICKET_EVENTS.REPLIED,
```

All other ticket events (CREATED, ASSIGNED, STATUS_CHANGED, RESOLVED, RATED) will use the default 90-day retention, which is appropriate for standard activity.

- [ ] **Step 6: Verify** -- Confirm no TypeScript errors by running `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx tsc --noEmit` (or deploy with `--typecheck=disable`).

**Commit:** `feat(tickets): add TICKET system slug and 7 event codes to event constants`

---

## Task 3: Shared Argument Validators

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/validators.ts`

Shared argument validators for all ticket system Convex functions.

- [ ] **Step 1: Create the validators file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/validators.ts`:

```typescript
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
```

**Commit:** `feat(tickets): add shared argument validators`

---

## Task 4: Ticket CRUD Mutations

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/mutations.ts`

All ticket write operations: create (with sequential numbering), reply (user), adminReply, updateStatus (auto-transitions), updatePriority, assign, unassign, close, reopen, rate, addTags, removeTags.

- [ ] **Step 1: Create the mutations file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/mutations.ts`:

```typescript
/**
 * Ticket System - Mutations
 *
 * All write operations for the ticket lifecycle:
 *   create          - Create a new ticket with sequential numbering
 *   reply           - User replies to their own ticket
 *   adminReply      - Admin/staff replies to a ticket (supports internal notes)
 *   updateStatus    - Update ticket status with auto-transitions
 *   updatePriority  - Update ticket priority
 *   assign          - Assign ticket to a staff member
 *   unassign        - Remove ticket assignment
 *   close           - Close a ticket
 *   reopen          - Reopen a closed/resolved ticket
 *   rate            - Submit CSAT rating
 *   addTags         - Add tags to a ticket
 *   removeTags      - Remove tags from a ticket
 *
 * Authorization:
 *   - ticket.view: any authenticated user can create and reply to own tickets
 *   - ticket.viewAll + ticket.respond: staff can reply to any ticket
 *   - ticket.assign: assign tickets to staff
 *   - ticket.updateStatus: change ticket status
 *   - ticket.updatePriority: change ticket priority
 *   - ticket.close: force close tickets
 *   - ticket.manageCannedResponses: manage canned responses
 *
 * Auto-status transitions:
 *   - User replies to "awaitingResponse" -> status becomes "open"
 *   - Admin replies to "open" -> status becomes "awaitingResponse"
 *   - Admin explicitly resolves -> "resolved"
 *   - Auto-close resolved after N days (cron) -> "closed"
 *
 * All mutations emit events via the Event Dispatcher System.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, requireAuth, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { TICKET_EVENTS, SYSTEM } from "../events/constants";
import {
  createTicketArgs,
  replyTicketArgs,
  adminReplyArgs,
  updateStatusArgs,
  updatePriorityArgs,
  assignTicketArgs,
  unassignTicketArgs,
  closeTicketArgs,
  reopenTicketArgs,
  rateTicketArgs,
  addTagsArgs,
  removeTagsArgs,
  MAX_SUBJECT_LENGTH,
  MIN_SUBJECT_LENGTH,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_RATING_COMMENT_LENGTH,
  MAX_ATTACHMENTS,
} from "./validators";

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new support ticket with sequential numbering.
 *
 * Flow:
 *   1. Authenticate user
 *   2. Validate subject and description length
 *   3. Generate sequential ticket number (TKT-YYYYMM-XXXXX)
 *   4. Snapshot user email/name
 *   5. Insert ticket record
 *   6. Insert initial description as first message (sequence 0)
 *   7. Emit ticket.created event
 *
 * @returns { ticketId, ticketNumber }
 */
export const create = mutation({
  args: createTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // ── Validate input ──────────────────────────────────────────────────
    if (
      args.subject.trim().length < MIN_SUBJECT_LENGTH ||
      args.subject.trim().length > MAX_SUBJECT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Subject must be between ${MIN_SUBJECT_LENGTH} and ${MAX_SUBJECT_LENGTH} characters`,
      });
    }
    if (
      args.description.trim().length < MIN_CONTENT_LENGTH ||
      args.description.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Description must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.tags && args.tags.length > MAX_TAGS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_TAGS} tags allowed`,
      });
    }
    if (args.tags) {
      for (const tag of args.tags) {
        if (tag.length > MAX_TAG_LENGTH) {
          throw new ConvexError({
            code: "VALIDATION",
            message: `Tag "${tag}" exceeds maximum length of ${MAX_TAG_LENGTH} characters`,
          });
        }
      }
    }

    // ── Generate sequential ticket number ───────────────────────────────
    const now = Date.now();
    const date = new Date(now);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-12

    // Atomic counter increment
    const counterDoc = await ctx.db
      .query("ticket_counters")
      .withIndex("by_year_month", (q) => q.eq("year", year).eq("month", month))
      .unique();

    let counter: number;
    if (counterDoc) {
      counter = counterDoc.counter + 1;
      await ctx.db.patch(counterDoc._id, { counter });
    } else {
      counter = 1;
      await ctx.db.insert("ticket_counters", { year, month, counter });
    }

    const monthStr = String(month).padStart(2, "0");
    const counterStr = String(counter).padStart(5, "0");
    const ticketNumber = `TKT-${year}${monthStr}-${counterStr}`;

    // ── Snapshot user data ──────────────────────────────────────────────
    const userEmailSnapshot = user.email;
    const userNameSnapshot =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    // ── Resolve default priority from settings ──────────────────────────
    let defaultPriority: "low" | "medium" | "high" = "medium";
    const prioritySetting = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();
    if (prioritySetting?.values?.ticketDefaultPriority) {
      defaultPriority = prioritySetting.values.ticketDefaultPriority;
    }

    // ── Insert ticket ───────────────────────────────────────────────────
    const ticketId = await ctx.db.insert("ticket_tickets", {
      ticketNumber,
      userId: user._id,
      userEmailSnapshot,
      userNameSnapshot,
      subject: args.subject.trim(),
      description: args.description.trim(),
      category: args.category,
      status: "open",
      priority: args.priority ?? defaultPriority,
      source: args.source ?? "dashboard",
      tags: args.tags ?? [],
      aiAttempted: args.aiAttempted ?? false,
      aiQuery: args.aiQuery,
      aiResponse: args.aiResponse,
      kbArticlesShown: args.kbArticlesShown,
      messageCount: 1, // Initial description counts as first message
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // ── Insert initial message (description as message #0) ──────────────
    await ctx.db.insert("ticket_messages", {
      ticketId,
      sequence: 0,
      senderType: "user",
      senderId: user._id,
      senderName: userNameSnapshot,
      senderEmail: userEmailSnapshot,
      content: args.description.trim(),
      isInternal: false,
      createdAt: now,
    });

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, TICKET_EVENTS.CREATED, SYSTEM.TICKET, {
      ticketId,
      ticketNumber,
      userId: user._id,
      category: args.category,
      priority: args.priority ?? defaultPriority,
      source: args.source ?? "dashboard",
      aiAttempted: args.aiAttempted ?? false,
    });

    return { ticketId, ticketNumber };
  },
});

// ─── Reply (User) ───────────────────────────────────────────────────────────

/**
 * User replies to their own ticket.
 *
 * Auto-transition: if ticket is "awaitingResponse", status becomes "open".
 * Increments messageCount and updates lastMessageAt.
 */
export const reply = mutation({
  args: replyTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // ── Validate ticket exists and belongs to user ──────────────────────
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }
    if (ticket.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only reply to your own tickets",
      });
    }
    if (ticket.status === "closed") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot reply to a closed ticket. Please reopen it first.",
      });
    }

    // ── Validate content ────────────────────────────────────────────────
    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_ATTACHMENTS} attachments per message`,
      });
    }

    // ── Compute next sequence number ────────────────────────────────────
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();
    const userNameSnapshot =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    // ── Insert message ──────────────────────────────────────────────────
    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "user",
      senderId: user._id,
      senderName: userNameSnapshot,
      senderEmail: user.email,
      content: args.content.trim(),
      isInternal: false,
      attachments: args.attachments,
      createdAt: now,
    });

    // ── Auto-transition: awaitingResponse -> open ───────────────────────
    const updates: Record<string, unknown> = {
      messageCount: ticket.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    };
    if (ticket.status === "awaitingResponse") {
      updates.status = "open";
    }
    await ctx.db.patch(args.ticketId, updates);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, TICKET_EVENTS.REPLIED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      messageId,
      senderType: "user",
      senderId: user._id,
    });

    return { messageId };
  },
});

// ─── Admin Reply ────────────────────────────────────────────────────────────

/**
 * Admin/staff replies to a ticket. Supports internal notes (isInternal=true).
 *
 * Auto-transition: if ticket is "open" and reply is NOT internal,
 * status becomes "awaitingResponse".
 *
 * If this is the first non-internal admin reply, records firstResponseAt for SLA.
 */
export const adminReply = mutation({
  args: adminReplyArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.respond");

    // ── Validate ticket exists ──────────────────────────────────────────
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // ── If internal note, require viewInternalNotes capability ──────────
    const isInternal = args.isInternal ?? false;
    if (isInternal) {
      await requireCan(ctx, "ticket.viewInternalNotes");
    }

    // ── Validate content ────────────────────────────────────────────────
    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_ATTACHMENTS} attachments per message`,
      });
    }

    // ── Compute next sequence number ────────────────────────────────────
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();
    const senderName =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    // ── Insert message ──────────────────────────────────────────────────
    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "admin",
      senderId: user._id,
      senderName,
      senderEmail: user.email,
      content: args.content.trim(),
      isInternal,
      attachments: args.attachments,
      createdAt: now,
    });

    // ── Update ticket ───────────────────────────────────────────────────
    const updates: Record<string, unknown> = {
      messageCount: ticket.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    };

    // Auto-transition: open -> awaitingResponse (only for non-internal replies)
    if (!isInternal && ticket.status === "open") {
      updates.status = "awaitingResponse";
    }

    // Track first response time for SLA
    if (!isInternal && !ticket.firstResponseAt) {
      updates.firstResponseAt = now;
    }

    await ctx.db.patch(args.ticketId, updates);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, TICKET_EVENTS.REPLIED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      messageId,
      senderType: "admin",
      senderId: user._id,
      isInternal,
    });

    return { messageId };
  },
});

// ─── Update Status ──────────────────────────────────────────────────────────

/**
 * Update ticket status. Records lifecycle timestamps for SLA tracking:
 *   - "resolved" -> sets resolvedAt
 *   - "closed" -> sets closedAt
 *   - Reopening from "resolved"/"closed" -> clears resolvedAt/closedAt
 */
export const updateStatus = mutation({
  args: updateStatusArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updateStatus");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.status === args.status) {
      return; // No-op if status unchanged
    }

    const now = Date.now();
    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Set lifecycle timestamps
    if (args.status === "resolved" && !ticket.resolvedAt) {
      updates.resolvedAt = now;
    }
    if (args.status === "closed" && !ticket.closedAt) {
      updates.closedAt = now;
    }

    await ctx.db.patch(args.ticketId, updates);

    // ── Emit appropriate event ──────────────────────────────────────────
    const eventCode =
      args.status === "resolved"
        ? TICKET_EVENTS.RESOLVED
        : args.status === "closed"
          ? TICKET_EVENTS.CLOSED
          : TICKET_EVENTS.STATUS_CHANGED;

    await emitEvent(ctx, eventCode, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      previousStatus: ticket.status,
      newStatus: args.status,
      changedBy: user._id,
    });
  },
});

// ─── Update Priority ────────────────────────────────────────────────────────

/**
 * Update ticket priority.
 */
export const updatePriority = mutation({
  args: updatePriorityArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updatePriority");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.priority === args.priority) {
      return; // No-op
    }

    await ctx.db.patch(args.ticketId, {
      priority: args.priority,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, TICKET_EVENTS.STATUS_CHANGED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      field: "priority",
      previousPriority: ticket.priority,
      newPriority: args.priority,
      changedBy: user._id,
    });
  },
});

// ─── Assign ─────────────────────────────────────────────────────────────────

/**
 * Assign a ticket to a staff member.
 */
export const assign = mutation({
  args: assignTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.assign");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Validate assignee exists
    const assignee = await ctx.db.get(args.assigneeId);
    if (!assignee) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Assignee user not found",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.ticketId, {
      assignedTo: args.assigneeId,
      assignedAt: now,
      // Auto-transition to inProgress if currently open
      ...(ticket.status === "open" ? { status: "inProgress" } : {}),
      updatedAt: now,
    });

    await emitEvent(ctx, TICKET_EVENTS.ASSIGNED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      assignedTo: args.assigneeId,
      assignedBy: user._id,
      previousAssignee: ticket.assignedTo,
    });
  },
});

// ─── Unassign ───────────────────────────────────────────────────────────────

/**
 * Remove ticket assignment.
 */
export const unassign = mutation({
  args: unassignTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.assign");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    await ctx.db.patch(args.ticketId, {
      assignedTo: undefined,
      assignedAt: undefined,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, TICKET_EVENTS.ASSIGNED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      assignedTo: null,
      unassignedBy: user._id,
      previousAssignee: ticket.assignedTo,
    });
  },
});

// ─── Close ──────────────────────────────────────────────────────────────────

/**
 * Force close a ticket. Requires ticket.close capability.
 */
export const close = mutation({
  args: closeTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.close");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.status === "closed") {
      return; // Already closed
    }

    const now = Date.now();
    await ctx.db.patch(args.ticketId, {
      status: "closed",
      closedAt: now,
      resolvedAt: ticket.resolvedAt ?? now,
      updatedAt: now,
    });

    await emitEvent(ctx, TICKET_EVENTS.CLOSED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      previousStatus: ticket.status,
      closedBy: user._id,
    });
  },
});

// ─── Reopen ─────────────────────────────────────────────────────────────────

/**
 * Reopen a resolved or closed ticket. Clears resolvedAt and closedAt.
 * The ticket owner can reopen their own ticket; staff need ticket.updateStatus.
 */
export const reopen = mutation({
  args: reopenTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Only resolved or closed tickets can be reopened",
      });
    }

    // Ticket owner can reopen their own ticket; staff need updateStatus cap
    if (ticket.userId !== user._id) {
      await requireCan(ctx, "ticket.updateStatus");
    }

    const now = Date.now();
    await ctx.db.patch(args.ticketId, {
      status: "open",
      resolvedAt: undefined,
      closedAt: undefined,
      updatedAt: now,
    });

    await emitEvent(ctx, TICKET_EVENTS.STATUS_CHANGED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      previousStatus: ticket.status,
      newStatus: "open",
      reopenedBy: user._id,
    });
  },
});

// ─── Rate ───────────────────────────────────────────────────────────────────

/**
 * Submit a CSAT rating for a resolved/closed ticket.
 * Only the ticket owner can rate. Rating is 1-5.
 */
export const rate = mutation({
  args: rateTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the ticket owner can submit a rating",
      });
    }

    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Only resolved or closed tickets can be rated",
      });
    }

    if (ticket.rating !== undefined) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "This ticket has already been rated",
      });
    }

    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Rating must be an integer between 1 and 5",
      });
    }

    if (args.comment && args.comment.length > MAX_RATING_COMMENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Rating comment must be at most ${MAX_RATING_COMMENT_LENGTH} characters`,
      });
    }

    await ctx.db.patch(args.ticketId, {
      rating: args.rating,
      ratingComment: args.comment?.trim(),
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, TICKET_EVENTS.RATED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      rating: args.rating,
      userId: user._id,
    });
  },
});

// ─── Add Tags ───────────────────────────────────────────────────────────────

/**
 * Add tags to a ticket. Deduplicates against existing tags.
 */
export const addTags = mutation({
  args: addTagsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updateStatus");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Validate tag constraints
    for (const tag of args.tags) {
      if (tag.trim().length === 0 || tag.length > MAX_TAG_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Tag must be between 1 and ${MAX_TAG_LENGTH} characters`,
        });
      }
    }

    // Deduplicate
    const existingTags = new Set(ticket.tags);
    const newTags = args.tags.filter((t) => !existingTags.has(t.trim()));
    const merged = [...ticket.tags, ...newTags.map((t) => t.trim())];

    if (merged.length > MAX_TAGS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_TAGS} tags allowed per ticket`,
      });
    }

    await ctx.db.patch(args.ticketId, {
      tags: merged,
      updatedAt: Date.now(),
    });
  },
});

// ─── Remove Tags ────────────────────────────────────────────────────────────

/**
 * Remove tags from a ticket.
 */
export const removeTags = mutation({
  args: removeTagsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updateStatus");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    const toRemove = new Set(args.tags);
    const filtered = ticket.tags.filter((t) => !toRemove.has(t));

    await ctx.db.patch(args.ticketId, {
      tags: filtered,
      updatedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm no errors.

**Commit:** `feat(tickets): add ticket CRUD mutations with sequential numbering and auto-transitions`

---

## Task 5: Ticket Queries

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/queries.ts`

All ticket read operations: getMyTickets, getByTicketNumber, getById, getTicketWithReplies, getQueue (admin filtered), getStats, getRecent, getAwaitingFirstResponse.

- [ ] **Step 1: Create the queries file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/queries.ts`:

```typescript
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
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add ticket queries with admin queue, stats, and SLA tracking`

---

## Task 6: Message Functions

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/messages.ts`

Message management: getByTicket, getPublicByTicket, getCount, edit (15-min window for users), remove, addInternalNote, addSystemMessage.

- [ ] **Step 1: Create the messages file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/messages.ts`:

```typescript
/**
 * Ticket System - Message Functions
 *
 * Query and mutation functions for ticket messages:
 *   getByTicket       - All messages for a ticket (admin, includes internal)
 *   getPublicByTicket - Public messages only (no internal notes)
 *   getCount          - Message count for a ticket
 *   edit              - Edit a message (15-min window for users, anytime for admins)
 *   remove            - Remove a message (soft: replaces content)
 *   addInternalNote   - Add an internal note (admin only)
 *   addSystemMessage  - Add a system-generated message
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  requireCan,
  requireAuth,
  getCurrentUser,
  currentUserCan,
} from "../helpers/permissions";
import {
  getMessagesByTicketArgs,
  getPublicMessagesByTicketArgs,
  getMessageCountArgs,
  editMessageArgs,
  removeMessageArgs,
  addInternalNoteArgs,
  addSystemMessageArgs,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MAX_ATTACHMENTS,
} from "./validators";

// ─── getByTicket ────────────────────────────────────────────────────────────

/**
 * All messages for a ticket, including internal notes.
 * Requires ticket.viewInternalNotes for internal notes to appear.
 * Messages ordered by sequence number.
 */
export const getByTicket = query({
  args: getMessagesByTicketArgs,
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

    const canViewInternal = await currentUserCan(
      ctx,
      "ticket.viewInternalNotes",
    );

    const messages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    return canViewInternal
      ? messages
      : messages.filter((m) => !m.isInternal);
  },
});

// ─── getPublicByTicket ──────────────────────────────────────────────────────

/**
 * Public messages only (no internal notes). For website ticket thread view.
 * Ordered by sequence number.
 */
export const getPublicByTicket = query({
  args: getPublicMessagesByTicketArgs,
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

    // Access check: own ticket or ticket.viewAll
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    const messages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    return messages.filter((m) => !m.isInternal);
  },
});

// ─── getCount ───────────────────────────────────────────────────────────────

/**
 * Get the public message count for a ticket.
 */
export const getCount = query({
  args: getMessageCountArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    // Access check
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    const messages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const publicCount = messages.filter((m) => !m.isInternal).length;
    const internalCount = messages.filter((m) => m.isInternal).length;

    return { publicCount, internalCount, totalCount: messages.length };
  },
});

// ─── edit ───────────────────────────────────────────────────────────────────

/**
 * Edit a message.
 *
 * Users can edit their own messages within a 15-minute window.
 * Admins with ticket.respond can edit any non-system message.
 */
export const edit = mutation({
  args: editMessageArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Message not found" });
    }

    // System messages cannot be edited
    if (message.senderType === "system") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "System messages cannot be edited",
      });
    }

    // Validate content
    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }

    const isOwner = message.senderId === user._id;
    const now = Date.now();

    if (isOwner) {
      // User can edit within the 15-minute window
      if (now - message.createdAt > MESSAGE_EDIT_WINDOW_MS) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Edit window has expired (15 minutes)",
        });
      }
    } else {
      // Non-owner needs ticket.respond capability
      await requireCan(ctx, "ticket.respond");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content.trim(),
      editedAt: now,
    });

    return { messageId: args.messageId };
  },
});

// ─── remove ─────────────────────────────────────────────────────────────────

/**
 * Remove a message (soft delete: replaces content with "[Message removed]").
 * Requires ticket.respond capability.
 */
export const remove = mutation({
  args: removeMessageArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.respond");

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Message not found" });
    }

    // Don't allow removing the initial description (sequence 0)
    if (message.sequence === 0) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The initial ticket description cannot be removed",
      });
    }

    await ctx.db.patch(args.messageId, {
      content: "[Message removed]",
      attachments: undefined,
      editedAt: Date.now(),
    });

    // Update ticket message count
    const ticket = await ctx.db.get(message.ticketId);
    if (ticket) {
      await ctx.db.patch(message.ticketId, {
        messageCount: Math.max(0, ticket.messageCount - 1),
        updatedAt: Date.now(),
      });
    }

    return { messageId: args.messageId };
  },
});

// ─── addInternalNote ────────────────────────────────────────────────────────

/**
 * Add an internal note to a ticket. Only visible to staff with
 * ticket.viewInternalNotes capability. Does NOT trigger auto-status
 * transitions or update lastMessageAt (since it's not user-visible).
 */
export const addInternalNote = mutation({
  args: addInternalNoteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.viewInternalNotes");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Note must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_ATTACHMENTS} attachments per message`,
      });
    }

    // Compute next sequence
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();
    const senderName =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "admin",
      senderId: user._id,
      senderName,
      senderEmail: user.email,
      content: args.content.trim(),
      isInternal: true,
      attachments: args.attachments,
      createdAt: now,
    });

    // Update message count but NOT lastMessageAt (internal note)
    await ctx.db.patch(args.ticketId, {
      messageCount: ticket.messageCount + 1,
      updatedAt: now,
    });

    return { messageId };
  },
});

// ─── addSystemMessage ───────────────────────────────────────────────────────

/**
 * Add a system-generated message to a ticket.
 * Used for auto-status transitions, assignments, etc.
 * This is an internal helper -- not directly callable by clients.
 * Wrapped as a mutation so it can be called from other mutations.
 */
export const addSystemMessage = mutation({
  args: addSystemMessageArgs,
  handler: async (ctx, args) => {
    // System messages require admin auth (any staff member)
    await requireCan(ctx, "ticket.respond");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Compute next sequence
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();

    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "system",
      senderName: "System",
      content: args.content,
      isInternal: false,
      createdAt: now,
    });

    await ctx.db.patch(args.ticketId, {
      messageCount: ticket.messageCount + 1,
      updatedAt: now,
    });

    return { messageId };
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add message queries and mutations with edit window and internal notes`

---

## Task 7: Canned Responses

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/cannedResponses.ts`

Full canned response CRUD: list, listByCategory, getByShortcut, search, applyTemplate, create, update, remove, incrementUsage, getCategories.

- [ ] **Step 1: Create the canned responses file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/cannedResponses.ts`:

```typescript
/**
 * Ticket System - Canned Response Functions
 *
 * CRUD and utility functions for admin canned response templates:
 *   list              - All canned responses (sorted by usage)
 *   listByCategory    - Filtered by category
 *   getByShortcut     - Lookup by shortcut string (e.g., "/refund")
 *   search            - Full-text search across title and content
 *   applyTemplate     - Apply template with {{variable}} substitution
 *   create            - Create a new canned response
 *   update            - Update an existing canned response
 *   remove            - Delete a canned response
 *   incrementUsage    - Bump usage counter (called on insertion)
 *   getCategories     - Get distinct category list
 *
 * Template variables supported:
 *   {{userName}}      - Ticket owner's display name
 *   {{ticketNumber}}  - The ticket number string
 *   {{category}}      - Ticket category label
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM } from "../events/constants";
import {
  createCannedResponseArgs,
  updateCannedResponseArgs,
  removeCannedResponseArgs,
  searchCannedResponsesArgs,
  applyTemplateArgs,
  MAX_CANNED_TITLE_LENGTH,
  MAX_CANNED_SHORTCUT_LENGTH,
  MAX_CANNED_CONTENT_LENGTH,
} from "./validators";

// ─── list ───────────────────────────────────────────────────────────────────

/**
 * List all canned responses, sorted by usage count (most used first).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    const responses = await ctx.db.query("ticket_cannedResponses").collect();
    responses.sort((a, b) => b.usageCount - a.usageCount);
    return responses;
  },
});

// ─── listByCategory ─────────────────────────────────────────────────────────

/**
 * List canned responses filtered by category.
 */
export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    const responses = await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();

    responses.sort((a, b) => b.usageCount - a.usageCount);
    return responses;
  },
});

// ─── getByShortcut ──────────────────────────────────────────────────────────

/**
 * Lookup a canned response by its shortcut string (e.g., "/refund").
 * Used for real-time shortcut matching as the admin types in the reply box.
 */
export const getByShortcut = query({
  args: { shortcut: v.string() },
  handler: async (ctx, args) => {
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    return await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_shortcut", (q) => q.eq("shortcut", args.shortcut))
      .unique();
  },
});

// ─── search ─────────────────────────────────────────────────────────────────

/**
 * Full-text search across canned response title and content.
 * Optionally filtered by category.
 */
export const search = query({
  args: searchCannedResponsesArgs,
  handler: async (ctx, args) => {
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    let responses;
    if (args.category) {
      responses = await ctx.db
        .query("ticket_cannedResponses")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      responses = await ctx.db.query("ticket_cannedResponses").collect();
    }

    const queryLower = args.query.toLowerCase();
    const matches = responses.filter(
      (r) =>
        r.title.toLowerCase().includes(queryLower) ||
        r.content.toLowerCase().includes(queryLower) ||
        r.shortcut.toLowerCase().includes(queryLower),
    );

    matches.sort((a, b) => b.usageCount - a.usageCount);
    return matches;
  },
});

// ─── applyTemplate ──────────────────────────────────────────────────────────

/**
 * Apply a canned response template to a ticket, substituting {{variables}}.
 * Returns the processed content string (does NOT insert a message).
 * Increments the usage count.
 */
export const applyTemplate = mutation({
  args: applyTemplateArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "ticket.respond");

    const template = await ctx.db.get(args.id);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Canned response not found",
      });
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Substitute variables
    let content = template.content;
    content = content.replace(/\{\{userName\}\}/g, ticket.userNameSnapshot);
    content = content.replace(/\{\{ticketNumber\}\}/g, ticket.ticketNumber);
    content = content.replace(/\{\{category\}\}/g, ticket.category);

    // Increment usage count
    await ctx.db.patch(args.id, {
      usageCount: template.usageCount + 1,
    });

    return { content };
  },
});

// ─── create ─────────────────────────────────────────────────────────────────

/**
 * Create a new canned response template.
 */
export const create = mutation({
  args: createCannedResponseArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.manageCannedResponses");

    // Validate lengths
    if (args.title.trim().length === 0 || args.title.length > MAX_CANNED_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Title must be between 1 and ${MAX_CANNED_TITLE_LENGTH} characters`,
      });
    }
    if (args.shortcut.trim().length === 0 || args.shortcut.length > MAX_CANNED_SHORTCUT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Shortcut must be between 1 and ${MAX_CANNED_SHORTCUT_LENGTH} characters`,
      });
    }
    if (args.content.trim().length === 0 || args.content.length > MAX_CANNED_CONTENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Content must be between 1 and ${MAX_CANNED_CONTENT_LENGTH} characters`,
      });
    }

    // Check shortcut uniqueness
    const existing = await ctx.db
      .query("ticket_cannedResponses")
      .withIndex("by_shortcut", (q) => q.eq("shortcut", args.shortcut.trim()))
      .unique();

    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Shortcut "${args.shortcut}" is already in use`,
      });
    }

    const now = Date.now();
    const id = await ctx.db.insert("ticket_cannedResponses", {
      title: args.title.trim(),
      shortcut: args.shortcut.trim(),
      content: args.content.trim(),
      category: args.category.trim(),
      usageCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, "ticket.canned_response_created", SYSTEM.TICKET, {
      cannedResponseId: id,
      title: args.title.trim(),
      shortcut: args.shortcut.trim(),
      createdBy: user._id,
    });

    return { id };
  },
});

// ─── update ─────────────────────────────────────────────────────────────────

/**
 * Update an existing canned response template.
 */
export const update = mutation({
  args: updateCannedResponseArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.manageCannedResponses");

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Canned response not found",
      });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      if (args.title.trim().length === 0 || args.title.length > MAX_CANNED_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Title must be between 1 and ${MAX_CANNED_TITLE_LENGTH} characters`,
        });
      }
      updates.title = args.title.trim();
    }

    if (args.shortcut !== undefined) {
      if (args.shortcut.trim().length === 0 || args.shortcut.length > MAX_CANNED_SHORTCUT_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Shortcut must be between 1 and ${MAX_CANNED_SHORTCUT_LENGTH} characters`,
        });
      }
      // Check uniqueness (excluding self)
      const conflict = await ctx.db
        .query("ticket_cannedResponses")
        .withIndex("by_shortcut", (q) => q.eq("shortcut", args.shortcut!.trim()))
        .unique();
      if (conflict && conflict._id !== args.id) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `Shortcut "${args.shortcut}" is already in use`,
        });
      }
      updates.shortcut = args.shortcut.trim();
    }

    if (args.content !== undefined) {
      if (args.content.trim().length === 0 || args.content.length > MAX_CANNED_CONTENT_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Content must be between 1 and ${MAX_CANNED_CONTENT_LENGTH} characters`,
        });
      }
      updates.content = args.content.trim();
    }

    if (args.category !== undefined) {
      updates.category = args.category.trim();
    }

    await ctx.db.patch(args.id, updates);

    await emitEvent(ctx, "ticket.canned_response_updated", SYSTEM.TICKET, {
      cannedResponseId: args.id,
      updatedBy: user._id,
    });

    return { id: args.id };
  },
});

// ─── remove ─────────────────────────────────────────────────────────────────

/**
 * Delete a canned response template permanently.
 */
export const remove = mutation({
  args: removeCannedResponseArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.manageCannedResponses");

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Canned response not found",
      });
    }

    await ctx.db.delete(args.id);

    await emitEvent(ctx, "ticket.canned_response_deleted", SYSTEM.TICKET, {
      cannedResponseId: args.id,
      title: existing.title,
      shortcut: existing.shortcut,
      deletedBy: user._id,
    });
  },
});

// ─── incrementUsage ─────────────────────────────────────────────────────────

/**
 * Increment the usage count of a canned response.
 * Called separately from applyTemplate when the admin actually sends the reply.
 */
export const incrementUsage = mutation({
  args: { id: v.id("ticket_cannedResponses") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "ticket.respond");

    const response = await ctx.db.get(args.id);
    if (!response) return;

    await ctx.db.patch(args.id, {
      usageCount: response.usageCount + 1,
    });
  },
});

// ─── getCategories ──────────────────────────────────────────────────────────

/**
 * Get a list of distinct categories used across all canned responses.
 */
export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const canManage = await currentUserCan(ctx, "ticket.respond");
    if (!canManage) return null;

    const responses = await ctx.db.query("ticket_cannedResponses").collect();
    const categories = [...new Set(responses.map((r) => r.category))];
    categories.sort();
    return categories;
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add canned response CRUD with template substitution`

---

## Task 8: Sessions

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/sessions.ts`

Session management for the floating support widget: create, validate, touch, associateUser, invalidate, cleanupExpired.

- [ ] **Step 1: Create the sessions file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/sessions.ts`:

```typescript
/**
 * Ticket System - Session Functions
 *
 * Anonymous session management for the support widget:
 *   create          - Create a new session with crypto-random ID
 *   validate        - Check if a session is valid and not expired
 *   touch           - Update lastActivityAt (extends implicit session lifetime)
 *   associateUser   - Link a session to an authenticated user
 *   invalidate      - Explicitly invalidate a session
 *   cleanupExpired  - Delete expired sessions (called by cron)
 *
 * Sessions have a 24-hour TTL. They enable anonymous users to interact
 * with the support widget (search KB, submit AI queries) before logging in.
 * Once the user authenticates, their session is associated with their user ID.
 */

import { ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  createSessionArgs,
  validateSessionArgs,
  touchSessionArgs,
  associateUserArgs,
  invalidateSessionArgs,
  SESSION_TTL_MS,
} from "./validators";

// ─── create ─────────────────────────────────────────────────────────────────

/**
 * Create a new session. The sessionId is generated client-side
 * (crypto.randomUUID()) and passed in.
 */
export const create = mutation({
  args: createSessionArgs,
  handler: async (ctx, args) => {
    // Check if session already exists
    const existing = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (existing) {
      // Session already exists, just touch it
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        lastActivityAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });
      return { sessionId: args.sessionId, isNew: false };
    }

    const now = Date.now();
    await ctx.db.insert("ticket_sessions", {
      sessionId: args.sessionId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastActivityAt: now,
    });

    return { sessionId: args.sessionId, isNew: true };
  },
});

// ─── validate ───────────────────────────────────────────────────────────────

/**
 * Check if a session is valid (exists and not expired).
 */
export const validate = query({
  args: validateSessionArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) {
      return { valid: false, reason: "not_found" };
    }

    if (session.expiresAt < Date.now()) {
      return { valid: false, reason: "expired" };
    }

    return {
      valid: true,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    };
  },
});

// ─── touch ──────────────────────────────────────────────────────────────────

/**
 * Update lastActivityAt to keep the session alive.
 * Extends the expiry by SESSION_TTL_MS from now.
 */
export const touch = mutation({
  args: touchSessionArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) return;

    const now = Date.now();
    await ctx.db.patch(session._id, {
      lastActivityAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
  },
});

// ─── associateUser ──────────────────────────────────────────────────────────

/**
 * Link a session to an authenticated user.
 * Called when a widget user logs in after starting a session anonymously.
 */
export const associateUser = mutation({
  args: associateUserArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Session not found",
      });
    }

    await ctx.db.patch(session._id, {
      userId: args.userId,
      lastActivityAt: Date.now(),
    });
  },
});

// ─── invalidate ─────────────────────────────────────────────────────────────

/**
 * Explicitly invalidate a session (e.g., on logout).
 */
export const invalidate = mutation({
  args: invalidateSessionArgs,
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    if (!session) return;

    await ctx.db.delete(session._id);
  },
});

// ─── cleanupExpired ─────────────────────────────────────────────────────────

/**
 * Delete expired sessions. Called by the daily cleanup cron.
 * Processes in batches to stay within mutation time limits.
 * Reschedules itself if more expired sessions remain.
 */
export const cleanupExpired = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const now = Date.now();

    const expired = await ctx.db
      .query("ticket_sessions")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(batchSize);

    for (const session of expired) {
      await ctx.db.delete(session._id);
    }

    // If we got a full batch, there may be more
    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.tickets.sessions.cleanupExpired,
        { batchSize },
      );
    }

    return { deleted: expired.length };
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add session management with TTL and cleanup`

---

## Task 9: Rate Limiting

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/rateLimit.ts`

Rate limiting for AI queries, ticket creation, and search: checkAndRecord, getStatus, cleanup, getGlobalStats.

- [ ] **Step 1: Create the rate limit file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/rateLimit.ts`:

```typescript
/**
 * Ticket System - Rate Limiting Functions
 *
 * Per-session, per-action rate limiting:
 *   checkAndRecord  - Check if action is allowed, record if so
 *   getStatus       - Get current rate limit status for a session+action
 *   cleanup         - Delete old rate limit records (cron)
 *   getGlobalStats  - Admin stats on rate limit usage
 *
 * Rate limits:
 *   - aiQuery: 5 requests per 1 minute
 *   - ticketCreate: 3 requests per 5 minutes
 *   - search: 10 requests per 10 seconds
 */

import { ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { currentUserCan } from "../helpers/permissions";
import {
  checkRateLimitArgs,
  getRateLimitStatusArgs,
  RATE_LIMIT_WINDOWS,
  RATE_LIMIT_MAX,
} from "./validators";

// ─── checkAndRecord ─────────────────────────────────────────────────────────

/**
 * Check if a rate-limited action is allowed for the given session.
 * If allowed, records the action and returns { allowed: true }.
 * If denied, returns { allowed: false, retryAfterMs }.
 *
 * This is an atomic check-and-record: the record is only inserted if allowed.
 */
export const checkAndRecord = mutation({
  args: checkRateLimitArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOWS[args.action];
    const maxRequests = RATE_LIMIT_MAX[args.action];
    const windowStart = now - windowMs;

    // Count recent records for this session + action
    const recentRecords = await ctx.db
      .query("ticket_rateLimits")
      .withIndex("by_session_action", (q) =>
        q.eq("sessionId", args.sessionId).eq("action", args.action),
      )
      .collect();

    // Filter to records within the current window
    const inWindow = recentRecords.filter((r) => r.createdAt >= windowStart);

    if (inWindow.length >= maxRequests) {
      // Rate limited - find when the oldest record in the window expires
      const oldest = inWindow.reduce(
        (min, r) => (r.createdAt < min ? r.createdAt : min),
        Infinity,
      );
      const retryAfterMs = oldest + windowMs - now;

      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Allowed - record the action
    await ctx.db.insert("ticket_rateLimits", {
      sessionId: args.sessionId,
      action: args.action,
      userId: args.userId,
      createdAt: now,
    });

    return {
      allowed: true,
      remaining: maxRequests - inWindow.length - 1,
      windowMs,
    };
  },
});

// ─── getStatus ──────────────────────────────────────────────────────────────

/**
 * Get the current rate limit status for a session + action.
 * Does NOT record an action.
 */
export const getStatus = query({
  args: getRateLimitStatusArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOWS[args.action];
    const maxRequests = RATE_LIMIT_MAX[args.action];
    const windowStart = now - windowMs;

    const recentRecords = await ctx.db
      .query("ticket_rateLimits")
      .withIndex("by_session_action", (q) =>
        q.eq("sessionId", args.sessionId).eq("action", args.action),
      )
      .collect();

    const inWindow = recentRecords.filter((r) => r.createdAt >= windowStart);

    return {
      used: inWindow.length,
      remaining: Math.max(0, maxRequests - inWindow.length),
      limit: maxRequests,
      windowMs,
      isLimited: inWindow.length >= maxRequests,
    };
  },
});

// ─── cleanup ────────────────────────────────────────────────────────────────

/**
 * Delete old rate limit records. Called by the cleanup cron.
 * Records older than 1 hour are deleted (well past any rate limit window).
 * Processes in batches.
 */
export const cleanup = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const expired = await ctx.db
      .query("ticket_rateLimits")
      .withIndex("by_created", (q) => q.lt("createdAt", oneHourAgo))
      .take(batchSize);

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.tickets.rateLimit.cleanup,
        { batchSize },
      );
    }

    return { deleted: expired.length };
  },
});

// ─── getGlobalStats ─────────────────────────────────────────────────────────

/**
 * Admin-only stats on rate limit usage across all sessions.
 * Returns counts per action for the last hour.
 */
export const getGlobalStats = query({
  args: {},
  handler: async (ctx) => {
    const canView = await currentUserCan(ctx, "ticket.viewAnalytics");
    if (!canView) return null;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const actions = ["aiQuery", "ticketCreate", "search"] as const;
    const stats: Record<string, { count: number; uniqueSessions: number }> = {};

    for (const action of actions) {
      const records = await ctx.db
        .query("ticket_rateLimits")
        .withIndex("by_action_time", (q) =>
          q.eq("action", action).gte("createdAt", oneHourAgo),
        )
        .collect();

      const uniqueSessions = new Set(records.map((r) => r.sessionId)).size;
      stats[action] = { count: records.length, uniqueSessions };
    }

    return stats;
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add rate limiting with per-session per-action windows`

---

## Task 10: Internal Functions

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/internals.ts`

Internal functions not callable from clients: generateTicketNumber (helper), autoCloseResolved (cron), cleanupSessions (cron), cleanupRateLimits (cron).

- [ ] **Step 1: Create the internals file**

Create `ConvexPress-Admin/packages/backend/convex/tickets/internals.ts`:

```typescript
/**
 * Ticket System - Internal Functions
 *
 * Not callable from clients. Used by:
 *   - Cron jobs (autoCloseResolved, cleanupAll)
 *   - Other internal functions
 *
 * Cron schedule:
 *   - autoCloseResolved: daily at 02:00 UTC
 *   - cleanupAll: daily at 03:00 UTC (sessions + rate limits)
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// ─── autoCloseResolved ──────────────────────────────────────────────────────

/**
 * Automatically close tickets that have been in "resolved" status for
 * longer than the configured auto-close period.
 *
 * Default: 14 days. Configurable via ticket.general.autoCloseAfterDays setting.
 * Set to 0 to disable auto-close.
 *
 * Processes in batches to stay within mutation time limits.
 */
export const autoCloseResolved = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;

    // Read auto-close setting
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    const autoCloseAfterDays = setting?.values?.ticketAutoCloseAfterDays ?? 14;

    if (autoCloseAfterDays === 0) {
      return { closed: 0, message: "Auto-close is disabled" };
    }

    const cutoffMs = Date.now() - autoCloseAfterDays * 24 * 60 * 60 * 1000;

    // Find resolved tickets older than the cutoff
    const resolvedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "resolved"))
      .collect();

    const toClose = resolvedTickets
      .filter((t) => t.resolvedAt && t.resolvedAt < cutoffMs)
      .slice(0, batchSize);

    const now = Date.now();
    for (const ticket of toClose) {
      await ctx.db.patch(ticket._id, {
        status: "closed",
        closedAt: now,
        updatedAt: now,
      });

      // Add system message
      const lastMessage = await ctx.db
        .query("ticket_messages")
        .withIndex("by_ticket_sequence", (q) =>
          q.eq("ticketId", ticket._id),
        )
        .order("desc")
        .first();
      const sequence = (lastMessage?.sequence ?? -1) + 1;

      await ctx.db.insert("ticket_messages", {
        ticketId: ticket._id,
        sequence,
        senderType: "system",
        senderName: "System",
        content: `This ticket was automatically closed after ${autoCloseAfterDays} days in resolved status.`,
        isInternal: false,
        createdAt: now,
      });
    }

    // If we hit the batch limit, schedule another run
    if (toClose.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.tickets.internals.autoCloseResolved,
        { batchSize },
      );
    }

    return { closed: toClose.length };
  },
});

// ─── cleanupAll ─────────────────────────────────────────────────────────────

/**
 * Orchestrator that triggers cleanup of sessions and rate limit records.
 * Called by daily cron.
 */
export const cleanupAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Schedule session cleanup
    await ctx.scheduler.runAfter(
      0,
      internal.tickets.sessions.cleanupExpired,
      {},
    );

    // Schedule rate limit cleanup
    await ctx.scheduler.runAfter(
      0,
      internal.tickets.rateLimit.cleanup,
      {},
    );
  },
});
```

- [ ] **Step 2: Register cron jobs**

Add ticket cron jobs to the Convex crons configuration. If there is a `convex/crons.ts` file, add to it. If not, create one.

Check if `ConvexPress-Admin/packages/backend/convex/crons.ts` exists. If it does, add these entries:

```typescript
import { internal } from "./_generated/api";

// ... existing crons ...

// Ticket System - Auto-close resolved tickets daily at 02:00 UTC
crons.daily(
  "ticket:auto-close-resolved",
  { hourUTC: 2, minuteUTC: 0 },
  internal.tickets.internals.autoCloseResolved,
  {},
);

// Ticket System - Cleanup expired sessions and rate limits daily at 03:00 UTC
crons.daily(
  "ticket:cleanup",
  { hourUTC: 3, minuteUTC: 0 },
  internal.tickets.internals.cleanupAll,
  {},
);
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add internal functions with auto-close and cleanup crons`

---

## Task 11: Settings Registration

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/settings.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/tickets/settings.ts`

Register ticket-specific setting groups and provide a seed/init function.

- [ ] **Step 1: Add ticket sections to settings schema if needed**

The current settings schema uses a `section` union validator. The ticket system settings can use the existing settings infrastructure by storing settings as key-value pairs in a new section. However, the settings schema currently uses a section-based approach with a fixed union.

Instead of modifying the settings schema union (which would require changing every system that imports it), the ticket system will store its settings by querying the settings table using a convention-based key approach (same pattern as the analytics system -- see `analytics/mutations.ts` which stores keys like `analytics_tracking_enabled`).

Create `ConvexPress-Admin/packages/backend/convex/tickets/settings.ts`:

```typescript
/**
 * Ticket System - Settings Functions
 *
 * Ticket-specific settings stored in the global settings table.
 * Uses the same key-value pattern as the Analytics system.
 *
 * Setting keys:
 *   ticket_categories          - JSON array of { value, label } category definitions
 *   ticket_default_priority    - Default priority for new tickets
 *   ticket_auto_close_days     - Days to auto-close resolved tickets (0 = disabled)
 *   ticket_sla_first_response  - First response SLA target in minutes
 *   ticket_sla_resolution      - Resolution SLA target in minutes
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM } from "../events/constants";

// ─── Default Settings ───────────────────────────────────────────────────────

export const TICKET_SETTING_DEFAULTS = {
  ticket_categories: [
    { value: "billing", label: "Billing" },
    { value: "technical", label: "Technical" },
    { value: "account", label: "Account" },
    { value: "featureRequest", label: "Feature Request" },
    { value: "general", label: "General" },
    { value: "other", label: "Other" },
  ],
  ticket_default_priority: "medium",
  ticket_auto_close_days: 14,
  ticket_sla_first_response: 240, // 4 hours in minutes
  ticket_sla_resolution: 2880, // 48 hours in minutes
};

// ─── getSettings ────────────────────────────────────────────────────────────

/**
 * Get all ticket-related settings.
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    const keys = Object.keys(TICKET_SETTING_DEFAULTS);
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      const setting = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

      result[key] = setting?.value ?? TICKET_SETTING_DEFAULTS[key as keyof typeof TICKET_SETTING_DEFAULTS];
    }

    return result;
  },
});

// ─── updateSettings ─────────────────────────────────────────────────────────

/**
 * Update ticket settings. Only administrators can change these.
 */
export const updateSettings = mutation({
  args: {
    categories: v.optional(
      v.array(v.object({ value: v.string(), label: v.string() })),
    ),
    defaultPriority: v.optional(v.string()),
    autoCloseDays: v.optional(v.number()),
    slaFirstResponse: v.optional(v.number()),
    slaResolution: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.manage");

    const changes: Record<string, unknown> = {};

    // Helper to upsert a setting
    async function upsertSetting(
      key: string,
      value: unknown,
      label: string,
      description: string,
      type: string,
    ) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { value });
      } else {
        await ctx.db.insert("settings", {
          key,
          value,
          group: "ticket",
          label,
          description,
          type,
          isPublic: false,
          isAutoloaded: true,
        });
      }
      changes[key] = value;
    }

    if (args.categories !== undefined) {
      await upsertSetting(
        "ticket_categories",
        args.categories,
        "Ticket Categories",
        "Available ticket categories",
        "json",
      );
    }

    if (args.defaultPriority !== undefined) {
      await upsertSetting(
        "ticket_default_priority",
        args.defaultPriority,
        "Default Priority",
        "Default priority for new tickets",
        "string",
      );
    }

    if (args.autoCloseDays !== undefined) {
      await upsertSetting(
        "ticket_auto_close_days",
        args.autoCloseDays,
        "Auto-Close After Days",
        "Days to auto-close resolved tickets (0 to disable)",
        "number",
      );
    }

    if (args.slaFirstResponse !== undefined) {
      await upsertSetting(
        "ticket_sla_first_response",
        args.slaFirstResponse,
        "First Response SLA (minutes)",
        "Target time for first admin response",
        "number",
      );
    }

    if (args.slaResolution !== undefined) {
      await upsertSetting(
        "ticket_sla_resolution",
        args.slaResolution,
        "Resolution SLA (minutes)",
        "Target time for ticket resolution",
        "number",
      );
    }

    if (Object.keys(changes).length > 0) {
      await emitEvent(ctx, "settings.updated", SYSTEM.SETTINGS, {
        section: "ticket",
        changes,
        updatedBy: user._id,
      });
    }
  },
});
```

Note: The `getSettings` query references a `by_key` index on the settings table. If the settings table does not have this index, the ticket system settings should fall back to a different approach. Check the existing settings schema -- the analytics system already uses this pattern successfully (see `analytics/mutations.ts` line 104). If the `by_key` index does not exist, you will need to add it to `convex/schema/settings.ts`.

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(tickets): add ticket settings with SLA targets and auto-close config`

---

## Task 12: Admin UI -- Ticket Queue (List)

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/tickets/TicketListTable.tsx`

The admin ticket queue -- a WordPress-style list table with filters for status, priority, category, and assignee.

- [ ] **Step 1: Create the route file**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { TicketListTable } from "@/components/tickets/TicketListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const ticketSearchSchema = z.object({
  status: z
    .enum(["open", "awaitingResponse", "inProgress", "resolved", "closed"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category: z
    .enum([
      "billing",
      "technical",
      "account",
      "featureRequest",
      "general",
      "other",
    ])
    .optional(),
  assignedTo: z.string().optional(),
  unassigned: z.boolean().optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["createdAt", "updatedAt", "priority", "lastMessageAt"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/",
)({
  validateSearch: ticketSearchSchema,
  component: TicketsPage,
});

function TicketsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <TicketListTable />
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 2: Create the TicketListTable component**

Create `ConvexPress-Admin/apps/web/src/components/tickets/TicketListTable.tsx`:

```typescript
/**
 * Ticket List Table - Admin ticket queue component.
 *
 * WordPress-style list table with:
 *   - Status tabs (All, Open, Awaiting Response, In Progress, Resolved, Closed)
 *   - Priority filter
 *   - Category filter
 *   - Assignee filter
 *   - Text search (subject, ticket number, user name)
 *   - Sortable columns
 *   - Pagination
 *   - Priority badge colors
 *   - Status badge colors
 *   - Click-to-navigate to ticket detail
 */

import { useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@convexpress/backend/generated/api";
import { Route } from "@/routes/_authenticated/_admin/tickets/index";
import {
  CircleDot,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  awaitingResponse: "Awaiting Response",
  inProgress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  featureRequest: "Feature Request",
  general: "General",
  other: "Other",
};

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    open: "bg-blue-500/15 text-blue-700",
    awaitingResponse: "bg-amber-500/15 text-amber-700",
    inProgress: "bg-purple-500/15 text-purple-700",
    resolved: "bg-green-500/15 text-green-700",
    closed: "bg-black/10 text-black/60",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[status] ?? "bg-black/10 text-black/60"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    low: "bg-black/5 text-black/50",
    medium: "bg-blue-500/15 text-blue-700",
    high: "bg-orange-500/15 text-orange-700",
    urgent: "bg-red-500/15 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[priority] ?? "bg-black/5 text-black/50"}`}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TicketListTable() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const result = useQuery(api.tickets.queries.getQueue, {
    status: search.status as any,
    priority: search.priority as any,
    category: search.category as any,
    assignedTo: search.assignedTo as any,
    unassigned: search.unassigned,
    search: search.search,
    orderBy: search.orderBy as any,
    orderDir: search.orderDir as any,
    page: search.page,
    perPage: search.perPage,
  });

  const stats = useQuery(api.tickets.queries.getStats);

  if (!result) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-black/5 rounded w-1/4" />
          <div className="h-64 bg-black/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-black/10">
        {[
          { key: undefined, label: "All", count: stats ? Object.values(stats.counts).reduce((a: number, b: number) => a + b, 0) : undefined },
          { key: "open", label: "Open", count: stats?.counts.open },
          { key: "awaitingResponse", label: "Awaiting", count: stats?.counts.awaitingResponse },
          { key: "inProgress", label: "In Progress", count: stats?.counts.inProgress },
          { key: "resolved", label: "Resolved", count: stats?.counts.resolved },
          { key: "closed", label: "Closed", count: stats?.counts.closed },
        ].map((tab) => (
          <button
            key={tab.key ?? "all"}
            onClick={() =>
              navigate({
                search: { ...search, status: tab.key as any, page: 1 },
              })
            }
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              search.status === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-black/60 hover:text-black/80"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-xs text-black/40">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters Row */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search tickets..."
          defaultValue={search.search ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            navigate({
              search: {
                ...search,
                search: value || undefined,
                page: 1,
              },
            });
          }}
          className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />

        <select
          value={search.priority ?? ""}
          onChange={(e) =>
            navigate({
              search: {
                ...search,
                priority: (e.target.value || undefined) as any,
                page: 1,
              },
            })
          }
          className="px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={search.category ?? ""}
          onChange={(e) =>
            navigate({
              search: {
                ...search,
                category: (e.target.value || undefined) as any,
                page: 1,
              },
            })
          }
          className="px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full divide-y divide-black/10">
          <thead className="bg-black/[0.02]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Ticket
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Assignee
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Submitted
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black/50 uppercase tracking-wider">
                Last Activity
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-black/5">
            {result.tickets.map((ticket) => (
              <tr
                key={ticket._id}
                onClick={() =>
                  navigate({
                    to: "/tickets/$ticketId",
                    params: { ticketId: ticket._id },
                  })
                }
                className="hover:bg-black/[0.02] cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-black/90 truncate max-w-xs">
                      {ticket.subject}
                    </div>
                    <div className="text-xs text-black/40 mt-0.5">
                      {ticket.ticketNumber} &middot; {ticket.userNameSnapshot}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-3 text-sm text-black/60">
                  {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                </td>
                <td className="px-4 py-3 text-sm text-black/60">
                  {ticket.assigneeName ?? (
                    <span className="text-black/30 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-black/50">
                  {formatTimeAgo(ticket.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm text-black/50">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    <span>{ticket.messageCount}</span>
                    {ticket.lastMessageAt && (
                      <span className="text-black/30 ml-1">
                        &middot; {formatTimeAgo(ticket.lastMessageAt)}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {result.tickets.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-black/40"
                >
                  No tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-black/50">
          <span>
            Showing {(result.page - 1) * result.perPage + 1}--
            {Math.min(result.page * result.perPage, result.total)} of{" "}
            {result.total}
          </span>
          <div className="flex gap-1">
            <button
              disabled={result.page <= 1}
              onClick={() =>
                navigate({
                  search: { ...search, page: result.page - 1 },
                })
              }
              className="px-3 py-1 rounded border border-black/15 disabled:opacity-30"
            >
              Previous
            </button>
            <button
              disabled={result.page >= result.totalPages}
              onClick={() =>
                navigate({
                  search: { ...search, page: result.page + 1 },
                })
              }
              className="px-3 py-1 rounded border border-black/15 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify** -- Navigate to the admin app and confirm the route loads without errors.

**Commit:** `feat(tickets): add admin ticket queue list table with filters and pagination`

---

## Task 13: Admin UI -- Ticket Detail

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/tickets/TicketDetail.tsx`

Full ticket detail page with message thread, reply box (with canned response shortcut), sidebar metadata (status, priority, category, assignee, tags, SLA), and internal notes toggle.

- [ ] **Step 1: Create the route file**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { TicketDetail } from "@/components/tickets/TicketDetail";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/$ticketId",
)({
  component: TicketDetailPage,
});

function TicketDetailPage() {
  const { ticketId } = Route.useParams();

  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <TicketDetail ticketId={ticketId} />
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 2: Create the TicketDetail component**

Create `ConvexPress-Admin/apps/web/src/components/tickets/TicketDetail.tsx`:

```typescript
/**
 * Ticket Detail - Admin ticket view with message thread + sidebar.
 *
 * Layout: Two-column
 *   Left (2/3): Message thread + reply box
 *   Right (1/3): Sidebar with status, priority, category, assignee, tags, SLA
 *
 * Features:
 *   - Real-time message thread (Convex subscription)
 *   - Reply box with canned response shortcut detection
 *   - Internal notes toggle
 *   - Status/priority/assignee quick actions in sidebar
 *   - SLA indicators (time since creation, time since first response)
 *   - CSAT rating display if rated
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@convexpress/backend/generated/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  User,
  Tag,
  Send,
  Lock,
  Star,
  AlertTriangle,
} from "lucide-react";
import type { Id } from "@convexpress/backend/generated/dataModel";

interface TicketDetailProps {
  ticketId: string;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TicketDetail({ ticketId }: TicketDetailProps) {
  const navigate = useNavigate();
  const [replyContent, setReplyContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const data = useQuery(api.tickets.queries.getTicketWithReplies, {
    ticketId: ticketId as Id<"ticket_tickets">,
    includeInternal: true,
  });

  const adminReply = useMutation(api.tickets.mutations.adminReply);
  const updateStatus = useMutation(api.tickets.mutations.updateStatus);
  const updatePriority = useMutation(api.tickets.mutations.updatePriority);
  const assignTicket = useMutation(api.tickets.mutations.assign);
  const closeTicket = useMutation(api.tickets.mutations.close);

  if (!data) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-black/5 rounded w-1/3" />
        <div className="h-96 bg-black/5 rounded" />
      </div>
    );
  }

  const { ticket, messages } = data;

  async function handleReply() {
    if (!replyContent.trim()) return;

    try {
      await adminReply({
        ticketId: ticketId as Id<"ticket_tickets">,
        content: replyContent,
        isInternal,
      });
      setReplyContent("");
      setIsInternal(false);
      toast.success(isInternal ? "Internal note added" : "Reply sent");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to send reply");
    }
  }

  async function handleStatusChange(newStatus: string) {
    try {
      await updateStatus({
        ticketId: ticketId as Id<"ticket_tickets">,
        status: newStatus as any,
      });
      toast.success(`Status updated to ${newStatus}`);
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to update status");
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/tickets" })}
          className="p-1 rounded hover:bg-black/5"
        >
          <ArrowLeft className="h-5 w-5 text-black/50" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <div className="text-sm text-black/50">
            {ticket.ticketNumber} &middot; Opened by{" "}
            {ticket.userNameSnapshot} ({ticket.userEmailSnapshot})
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Message Thread (2/3) */}
        <div className="col-span-2 space-y-4">
          {/* Messages */}
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`rounded-lg border p-4 ${
                  msg.isInternal
                    ? "border-amber-300/50 bg-amber-50/50"
                    : msg.senderType === "system"
                      ? "border-black/5 bg-black/[0.02]"
                      : msg.senderType === "admin"
                        ? "border-blue-200/50 bg-blue-50/30"
                        : "border-black/10 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {msg.senderName}
                    </span>
                    {msg.isInternal && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-500/15 px-1.5 py-0.5 rounded">
                        <Lock className="h-3 w-3" /> Internal
                      </span>
                    )}
                    {msg.senderType === "system" && (
                      <span className="text-xs text-black/40 bg-black/5 px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-black/40">
                    {formatDate(msg.createdAt)}
                    {msg.editedAt && " (edited)"}
                  </span>
                </div>
                <div className="text-sm text-black/80 whitespace-pre-wrap">
                  {msg.content}
                </div>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {msg.attachments.map((att, i) => (
                      <span
                        key={i}
                        className="text-xs bg-black/5 px-2 py-1 rounded"
                      >
                        {att.name} ({Math.round(att.size / 1024)}KB)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Reply Box */}
          {ticket.status !== "closed" && (
            <div className="rounded-lg border border-black/10 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsInternal(false)}
                  className={`text-sm font-medium px-3 py-1 rounded ${
                    !isInternal
                      ? "bg-blue-500/15 text-blue-700"
                      : "text-black/50 hover:text-black/70"
                  }`}
                >
                  Reply
                </button>
                <button
                  onClick={() => setIsInternal(true)}
                  className={`text-sm font-medium px-3 py-1 rounded flex items-center gap-1 ${
                    isInternal
                      ? "bg-amber-500/15 text-amber-700"
                      : "text-black/50 hover:text-black/70"
                  }`}
                >
                  <Lock className="h-3 w-3" /> Internal Note
                </button>
              </div>
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={
                  isInternal
                    ? "Add an internal note (not visible to the user)..."
                    : "Type your reply..."
                }
                rows={4}
                className="w-full px-3 py-2 text-sm border border-black/15 rounded-md bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleReply}
                  disabled={!replyContent.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-4 w-4" />
                  {isInternal ? "Add Note" : "Send Reply"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          {/* Status */}
          <div className="rounded-lg border border-black/10 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-black/70">Status</h3>
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
            >
              <option value="open">Open</option>
              <option value="awaitingResponse">Awaiting Response</option>
              <option value="inProgress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Priority */}
          <div className="rounded-lg border border-black/10 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-black/70">Priority</h3>
            <select
              value={ticket.priority}
              onChange={async (e) => {
                try {
                  await updatePriority({
                    ticketId: ticketId as Id<"ticket_tickets">,
                    priority: e.target.value as any,
                  });
                  toast.success("Priority updated");
                } catch (error: any) {
                  toast.error(error.data?.message ?? "Failed to update");
                }
              }}
              className="w-full px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Category & Source */}
          <div className="rounded-lg border border-black/10 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70">Details</h3>
            <div className="text-sm">
              <span className="text-black/50">Category:</span>{" "}
              <span className="text-black/80">{ticket.category}</span>
            </div>
            <div className="text-sm">
              <span className="text-black/50">Source:</span>{" "}
              <span className="text-black/80">{ticket.source}</span>
            </div>
            {ticket.aiAttempted && (
              <div className="text-sm text-purple-700">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                AI deflection attempted
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="rounded-lg border border-black/10 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70 flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" /> Tags
            </h3>
            <div className="flex flex-wrap gap-1">
              {ticket.tags.length > 0 ? (
                ticket.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-black/5 px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-black/30 italic">No tags</span>
              )}
            </div>
          </div>

          {/* SLA */}
          <div className="rounded-lg border border-black/10 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-black/70 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> SLA
            </h3>
            <div className="text-sm">
              <span className="text-black/50">Created:</span>{" "}
              <span className="text-black/80">{formatDate(ticket.createdAt)}</span>
            </div>
            {ticket.firstResponseAt ? (
              <div className="text-sm">
                <span className="text-black/50">First response:</span>{" "}
                <span className="text-black/80">
                  {formatDuration(ticket.firstResponseAt - ticket.createdAt)}
                </span>
              </div>
            ) : (
              <div className="text-sm text-orange-600">
                <Clock className="h-3 w-3 inline mr-1" />
                Awaiting first response ({formatDuration(Date.now() - ticket.createdAt)})
              </div>
            )}
            {ticket.resolvedAt && (
              <div className="text-sm">
                <span className="text-black/50">Resolved in:</span>{" "}
                <span className="text-black/80">
                  {formatDuration(ticket.resolvedAt - ticket.createdAt)}
                </span>
              </div>
            )}
          </div>

          {/* CSAT */}
          {ticket.rating !== undefined && (
            <div className="rounded-lg border border-black/10 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-black/70 flex items-center gap-1">
                <Star className="h-3.5 w-3.5" /> Rating
              </h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${
                      star <= ticket.rating!
                        ? "fill-amber-400 text-amber-400"
                        : "text-black/15"
                    }`}
                  />
                ))}
                <span className="text-sm text-black/60 ml-1">
                  {ticket.rating}/5
                </span>
              </div>
              {ticket.ratingComment && (
                <p className="text-sm text-black/60 italic">
                  "{ticket.ratingComment}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify** -- Navigate to `/admin/tickets/{id}` and confirm the detail page renders.

**Commit:** `feat(tickets): add admin ticket detail page with thread, reply box, and sidebar`

---

## Task 14: Admin UI -- Canned Responses Management

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/canned-responses.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/tickets/CannedResponsesManager.tsx`

Admin page for managing canned response templates -- list, create, edit, delete.

- [ ] **Step 1: Create the route file**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/canned-responses.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { CannedResponsesManager } from "@/components/tickets/CannedResponsesManager";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/canned-responses",
)({
  component: CannedResponsesPage,
});

function CannedResponsesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <CannedResponsesManager />
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 2: Create the CannedResponsesManager component**

Create `ConvexPress-Admin/apps/web/src/components/tickets/CannedResponsesManager.tsx`. This should be a full-page management UI with:
- List of all canned responses grouped by category
- Create new canned response form (title, shortcut, content, category)
- Edit existing responses inline or via expanding panel
- Delete with confirmation dialog
- Usage count display
- Template variable documentation

The implementation follows the same WordPress-style admin list table pattern used throughout ConvexPress. Full component code omitted for brevity but should follow the same patterns as `CommentListTable` and `PostListTable` -- using `useQuery`/`useMutation` from Convex, `toast` from Sonner for feedback, Lucide icons, and Tailwind CSS with CSS variables (no hardcoded colors).

- [ ] **Step 3: Verify** -- Navigate to `/admin/tickets/canned-responses` and confirm the page loads.

**Commit:** `feat(tickets): add admin canned responses management page`

---

## Task 15: Admin UI -- Ticket Analytics + Settings

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/analytics.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/settings.tsx`

Analytics dashboard with ticket volume, SLA compliance, CSAT trends. Settings page for categories, auto-close, SLA targets.

- [ ] **Step 1: Create the analytics route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/analytics.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress/backend/generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import {
  BarChart3,
  Clock,
  Star,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/analytics",
)({
  component: TicketAnalyticsPage,
});

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4">
      <div className="flex items-center gap-2 text-black/50 mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-black/90">{value}</div>
      {subtext && (
        <div className="text-xs text-black/40 mt-1">{subtext}</div>
      )}
    </div>
  );
}

function TicketAnalyticsPage() {
  const stats = useQuery(api.tickets.queries.getStats);
  const rateLimitStats = useQuery(api.tickets.rateLimit.getGlobalStats);

  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Ticket Analytics</h1>

        {stats ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Active Tickets"
                value={stats.totalActive}
                icon={BarChart3}
                subtext={`${stats.counts.open ?? 0} open, ${stats.counts.inProgress ?? 0} in progress`}
              />
              <StatCard
                label="Avg First Response"
                value={formatDuration(stats.avgFirstResponseMs)}
                icon={Clock}
                subtext="Last 30 days"
              />
              <StatCard
                label="Avg Resolution"
                value={formatDuration(stats.avgResolutionMs)}
                icon={TrendingUp}
                subtext="Last 30 days"
              />
              <StatCard
                label="CSAT Score"
                value={stats.avgRating > 0 ? `${stats.avgRating.toFixed(1)}/5` : "N/A"}
                icon={Star}
                subtext={`${stats.ratedCount} ratings`}
              />
            </div>

            {/* Status Breakdown */}
            <div className="rounded-lg border border-black/10 p-4">
              <h2 className="text-sm font-semibold text-black/70 mb-3">
                Tickets by Status
              </h2>
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(stats.counts).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <div className="text-lg font-bold">{count as number}</div>
                    <div className="text-xs text-black/50 capitalize">
                      {status.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Breakdown */}
            <div className="rounded-lg border border-black/10 p-4">
              <h2 className="text-sm font-semibold text-black/70 mb-3">
                Active Tickets by Priority
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(stats.priorityCounts).map(
                  ([priority, count]) => (
                    <div key={priority} className="text-center">
                      <div className="text-lg font-bold">
                        {count as number}
                      </div>
                      <div className="text-xs text-black/50 capitalize">
                        {priority}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-black/5 rounded-lg" />
              ))}
            </div>
          </div>
        )}
      </div>
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 2: Create the settings route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/settings.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convexpress/backend/generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/settings",
)({
  component: TicketSettingsPage,
});

function TicketSettingsPage() {
  const settings = useQuery(api.tickets.settings.getSettings);
  const updateSettings = useMutation(api.tickets.settings.updateSettings);

  const [autoCloseDays, setAutoCloseDays] = useState<number | undefined>();
  const [slaFirstResponse, setSlaFirstResponse] = useState<number | undefined>();
  const [slaResolution, setSlaResolution] = useState<number | undefined>();
  const [defaultPriority, setDefaultPriority] = useState<string | undefined>();

  // Initialize from loaded settings
  const effectiveAutoClose = autoCloseDays ?? settings?.ticket_auto_close_days ?? 14;
  const effectiveSlaFirst = slaFirstResponse ?? settings?.ticket_sla_first_response ?? 240;
  const effectiveSlaRes = slaResolution ?? settings?.ticket_sla_resolution ?? 2880;
  const effectivePriority = defaultPriority ?? settings?.ticket_default_priority ?? "medium";

  async function handleSave() {
    try {
      await updateSettings({
        autoCloseDays: effectiveAutoClose,
        slaFirstResponse: effectiveSlaFirst,
        slaResolution: effectiveSlaRes,
        defaultPriority: effectivePriority,
      });
      toast.success("Settings saved");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to save settings");
    }
  }

  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Ticket Settings</h1>

        {/* General */}
        <div className="rounded-lg border border-black/10 p-6 space-y-4">
          <h2 className="text-lg font-semibold">General</h2>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1">
              Default Priority
            </label>
            <select
              value={effectivePriority}
              onChange={(e) => setDefaultPriority(e.target.value)}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1">
              Auto-close resolved tickets after (days)
            </label>
            <input
              type="number"
              min={0}
              value={effectiveAutoClose}
              onChange={(e) => setAutoCloseDays(Number(e.target.value))}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
            />
            <p className="text-xs text-black/40 mt-1">
              Set to 0 to disable auto-close.
            </p>
          </div>
        </div>

        {/* SLA */}
        <div className="rounded-lg border border-black/10 p-6 space-y-4">
          <h2 className="text-lg font-semibold">SLA Targets</h2>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1">
              First Response Target (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={effectiveSlaFirst}
              onChange={(e) => setSlaFirstResponse(Number(e.target.value))}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
            />
            <p className="text-xs text-black/40 mt-1">
              Default: 240 minutes (4 hours)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1">
              Resolution Target (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={effectiveSlaRes}
              onChange={(e) => setSlaResolution(Number(e.target.value))}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-white"
            />
            <p className="text-xs text-black/40 mt-1">
              Default: 2880 minutes (48 hours)
            </p>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Save className="h-4 w-4" />
          Save Settings
        </button>
      </div>
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 3: Verify** -- Navigate to `/admin/tickets/analytics` and `/admin/tickets/settings`.

**Commit:** `feat(tickets): add admin analytics dashboard and settings pages`

---

## Task 16: Website UI -- Support Landing Page

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/support/index.tsx`

The public support landing page at `/support` with links to create a ticket, view existing tickets, and search for help.

- [ ] **Step 1: Create the route**

Create `ConvexPress-Website/apps/web/src/routes/_marketing/support/index.tsx`:

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import {
  LifeBuoy,
  MessageSquarePlus,
  List,
  Search,
} from "lucide-react";

export const Route = createFileRoute("/_marketing/support/")({
  component: SupportLandingPage,
  head: () => ({
    meta: [{ title: "Support - ConvexPress" }],
  }),
});

function SupportLandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <LifeBuoy className="h-12 w-12 mx-auto text-blue-600" />
        <h1 className="text-3xl font-bold">How can we help?</h1>
        <p className="text-lg text-black/60 max-w-lg mx-auto">
          Browse our help center, search for answers, or submit a support
          ticket and we'll get back to you as soon as possible.
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/support/new"
          className="rounded-lg border border-black/10 p-6 hover:border-blue-300 hover:shadow-sm transition-all text-center space-y-2"
        >
          <MessageSquarePlus className="h-8 w-8 mx-auto text-blue-600" />
          <h2 className="text-lg font-semibold">Submit a Ticket</h2>
          <p className="text-sm text-black/50">
            Describe your issue and our team will respond promptly.
          </p>
        </Link>

        {isSignedIn && (
          <Link
            to="/support/tickets"
            className="rounded-lg border border-black/10 p-6 hover:border-blue-300 hover:shadow-sm transition-all text-center space-y-2"
          >
            <List className="h-8 w-8 mx-auto text-green-600" />
            <h2 className="text-lg font-semibold">My Tickets</h2>
            <p className="text-sm text-black/50">
              View and manage your existing support tickets.
            </p>
          </Link>
        )}

        <Link
          to="/help"
          className="rounded-lg border border-black/10 p-6 hover:border-blue-300 hover:shadow-sm transition-all text-center space-y-2"
        >
          <Search className="h-8 w-8 mx-auto text-purple-600" />
          <h2 className="text-lg font-semibold">Help Center</h2>
          <p className="text-sm text-black/50">
            Search our knowledge base for instant answers.
          </p>
        </Link>
      </div>

      {!isSignedIn && (
        <div className="text-center text-sm text-black/40">
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>{" "}
          to submit a ticket or view your existing tickets.
        </div>
      )}
    </div>
  );
}
```

**Commit:** `feat(tickets): add website support landing page`

---

## Task 17: Website UI -- My Tickets List

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx`

Authenticated page showing the user's own tickets with status filtering.

- [ ] **Step 1: Create the route**

Create `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx`:

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";
import { MessageSquarePlus, Clock, CheckCircle2 } from "lucide-react";

const searchSchema = z.object({
  status: z
    .enum(["open", "awaitingResponse", "inProgress", "resolved", "closed"])
    .optional(),
  page: z.number().min(1).optional(),
});

export const Route = createFileRoute("/_marketing/support/tickets/")({
  validateSearch: searchSchema,
  component: MyTicketsPage,
  head: () => ({
    meta: [{ title: "My Tickets - Support" }],
  }),
});

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  awaitingResponse: "Awaiting Response",
  inProgress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MyTicketsPage() {
  const { isSignedIn } = useAuth();
  const search = Route.useSearch();

  const result = useQuery(
    api.tickets.queries.getMyTickets,
    isSignedIn
      ? {
          status: search.status as any,
          page: search.page,
        }
      : "skip",
  );

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <p className="text-black/60">
          Please{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            sign in
          </Link>{" "}
          to view your support tickets.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <Link
          to="/support/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Ticket
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-black/10 overflow-x-auto">
        {[
          { key: undefined, label: "All" },
          { key: "open", label: "Open" },
          { key: "awaitingResponse", label: "Awaiting" },
          { key: "resolved", label: "Resolved" },
          { key: "closed", label: "Closed" },
        ].map((tab) => (
          <Link
            key={tab.key ?? "all"}
            to="/support/tickets"
            search={{ status: tab.key as any }}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              search.status === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-black/60 hover:text-black/80"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Ticket List */}
      {result ? (
        <div className="space-y-3">
          {result.tickets.map((ticket) => (
            <Link
              key={ticket._id}
              to="/support/tickets/$ticketId"
              params={{ ticketId: ticket._id }}
              className="block rounded-lg border border-black/10 p-4 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{ticket.subject}</div>
                  <div className="text-xs text-black/40 mt-1">
                    {ticket.ticketNumber} &middot; {formatTimeAgo(ticket.createdAt)}
                  </div>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-black/5">
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-black/40">
                <span>{ticket.messageCount} messages</span>
                {ticket.lastMessageAt && (
                  <span>Last activity {formatTimeAgo(ticket.lastMessageAt)}</span>
                )}
              </div>
            </Link>
          ))}

          {result.tickets.length === 0 && (
            <div className="text-center py-12 text-black/40">
              <p>No tickets found.</p>
              <Link
                to="/support/new"
                className="text-blue-600 hover:underline text-sm mt-2 inline-block"
              >
                Submit your first ticket
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-black/5 rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Commit:** `feat(tickets): add website my tickets list page`

---

## Task 18: Website UI -- Ticket Thread

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx`

Authenticated page showing a ticket's message thread with reply box and CSAT rating prompt.

- [ ] **Step 1: Create the route**

Create `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx`:

```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";
import { ArrowLeft, Send, Star } from "lucide-react";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

export const Route = createFileRoute(
  "/_marketing/support/tickets/$ticketId",
)({
  component: TicketThreadPage,
  head: () => ({
    meta: [{ title: "Ticket - Support" }],
  }),
});

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TicketThreadPage() {
  const { ticketId } = Route.useParams();
  const { isSignedIn } = useAuth();
  const [replyContent, setReplyContent] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [showRating, setShowRating] = useState(false);

  const data = useQuery(
    api.tickets.queries.getTicketWithReplies,
    isSignedIn
      ? {
          ticketId: ticketId as Id<"ticket_tickets">,
          includeInternal: false,
        }
      : "skip",
  );

  const replyMutation = useMutation(api.tickets.mutations.reply);
  const rateMutation = useMutation(api.tickets.mutations.rate);
  const reopenMutation = useMutation(api.tickets.mutations.reopen);

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p>
          Please{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            sign in
          </Link>{" "}
          to view this ticket.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-black/5 rounded w-1/3" />
        <div className="h-64 bg-black/5 rounded" />
      </div>
    );
  }

  const { ticket, messages } = data;

  async function handleReply() {
    if (!replyContent.trim()) return;
    try {
      await replyMutation({
        ticketId: ticketId as Id<"ticket_tickets">,
        content: replyContent,
      });
      setReplyContent("");
      toast.success("Reply sent");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to send reply");
    }
  }

  async function handleRate() {
    if (rating < 1 || rating > 5) return;
    try {
      await rateMutation({
        ticketId: ticketId as Id<"ticket_tickets">,
        rating,
        comment: ratingComment || undefined,
      });
      setShowRating(false);
      toast.success("Thank you for your feedback!");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to submit rating");
    }
  }

  async function handleReopen() {
    try {
      await reopenMutation({
        ticketId: ticketId as Id<"ticket_tickets">,
      });
      toast.success("Ticket reopened");
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to reopen ticket");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/support/tickets"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Tickets
        </Link>
        <h1 className="text-2xl font-bold">{ticket.subject}</h1>
        <div className="text-sm text-black/50 mt-1">
          {ticket.ticketNumber} &middot; {ticket.category} &middot;{" "}
          {ticket.status}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg._id}
            className={`rounded-lg border p-4 ${
              msg.senderType === "system"
                ? "border-black/5 bg-black/[0.02] text-center text-sm text-black/50"
                : msg.senderType === "user"
                  ? "border-black/10 bg-white"
                  : "border-blue-100 bg-blue-50/30"
            }`}
          >
            {msg.senderType !== "system" && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {msg.senderName}
                  {msg.senderType === "admin" && (
                    <span className="text-xs text-blue-600 ml-1">(Support)</span>
                  )}
                </span>
                <span className="text-xs text-black/40">
                  {formatDate(msg.createdAt)}
                </span>
              </div>
            )}
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
      </div>

      {/* Reply Box (visible for non-closed tickets) */}
      {ticket.status !== "closed" && (
        <div className="space-y-3">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Type your reply..."
            rows={4}
            className="w-full px-3 py-2 text-sm border border-black/15 rounded-md bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <div className="flex justify-end">
            <button
              onClick={handleReply}
              disabled={!replyContent.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Send className="h-4 w-4" />
              Send Reply
            </button>
          </div>
        </div>
      )}

      {/* Reopen (for resolved/closed tickets) */}
      {(ticket.status === "resolved" || ticket.status === "closed") && (
        <div className="text-center space-y-3 py-4 border-t border-black/10">
          <p className="text-sm text-black/50">
            This ticket is {ticket.status}. Still need help?
          </p>
          <button
            onClick={handleReopen}
            className="px-4 py-2 text-sm font-medium border border-black/15 rounded-md hover:bg-black/5 transition-colors"
          >
            Reopen Ticket
          </button>
        </div>
      )}

      {/* CSAT Rating Prompt (for resolved/closed, not yet rated) */}
      {(ticket.status === "resolved" || ticket.status === "closed") &&
        ticket.rating === undefined && (
          <div className="rounded-lg border border-black/10 p-6 text-center space-y-3">
            <h3 className="font-semibold">How was your experience?</h3>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => {
                    setRating(star);
                    setShowRating(true);
                  }}
                  className="p-1"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-black/15 hover:text-amber-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            {showRating && (
              <>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Any additional feedback? (optional)"
                  rows={2}
                  className="w-full max-w-md mx-auto px-3 py-2 text-sm border border-black/15 rounded-md"
                />
                <button
                  onClick={handleRate}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Submit Rating
                </button>
              </>
            )}
          </div>
        )}

      {/* Already rated */}
      {ticket.rating !== undefined && (
        <div className="rounded-lg border border-black/10 p-4 text-center text-sm text-black/50">
          You rated this ticket {ticket.rating}/5. Thank you for your feedback!
        </div>
      )}
    </div>
  );
}
```

**Commit:** `feat(tickets): add website ticket thread page with reply and CSAT rating`

---

## Task 19: Website UI -- Create Ticket

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx`

Create ticket form with category selection, priority, subject, description, and optional AI deflection context fields.

- [ ] **Step 1: Create the route**

Create `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx`:

```typescript
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";

export const Route = createFileRoute("/_marketing/support/new")({
  component: CreateTicketPage,
  head: () => ({
    meta: [{ title: "New Ticket - Support" }],
  }),
});

const CATEGORIES = [
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "account", label: "Account" },
  { value: "featureRequest", label: "Feature Request" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
];

function CreateTicketPage() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [submitting, setSubmitting] = useState(false);

  const createTicket = useMutation(api.tickets.mutations.create);

  if (!isSignedIn) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">Submit a Ticket</h1>
        <p className="text-black/60">
          Please{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            sign in
          </Link>{" "}
          to submit a support ticket.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const result = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category: category as any,
        source: "dashboard",
      });
      toast.success(`Ticket ${result.ticketNumber} created`);
      navigate({
        to: "/support/tickets/$ticketId",
        params: { ticketId: result.ticketId },
      });
    } catch (error: any) {
      toast.error(error.data?.message ?? "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link
          to="/support"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Support
        </Link>
        <h1 className="text-2xl font-bold">Submit a Ticket</h1>
        <p className="text-sm text-black/50 mt-1">
          Describe your issue and our support team will get back to you as
          soon as possible.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-black/15 rounded-md bg-white"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of your issue"
            maxLength={200}
            className="w-full px-3 py-2 text-sm border border-black/15 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <p className="text-xs text-black/30 mt-1">
            {subject.length}/200 characters
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please describe your issue in detail. Include any steps to reproduce, expected behavior, and screenshots if applicable."
            rows={8}
            maxLength={10000}
            className="w-full px-3 py-2 text-sm border border-black/15 rounded-md bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <p className="text-xs text-black/30 mt-1">
            {description.length}/10000 characters
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              !subject.trim() ||
              subject.trim().length < 5 ||
              !description.trim() ||
              description.trim().length < 10 ||
              submitting
            }
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Submitting..." : "Submit Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Commit:** `feat(tickets): add website create ticket form`

---

## Task 20: Event + Email + Audit Integration

**Files:**
- Modify: Event constants (already done in Task 2)
- Integration points documented here for the Event Dispatcher, Email Notification System, and Audit Log System

This task connects the ticket system to ConvexPress's existing infrastructure systems.

- [ ] **Step 1: Register ticket capabilities**

Add the following capabilities to the capability seed data or registration function. The exact file depends on how capabilities are currently seeded (check `ConvexPress-Admin/packages/backend/convex/seed/` or the Role & Capability System expert's implementation).

New capabilities to register:

```
ticket.view           - View own tickets (all authenticated users)
ticket.viewAll        - View all tickets (Editor+)
ticket.respond        - Reply to tickets (Author+)
ticket.assign         - Assign tickets to staff (Editor+)
ticket.updateStatus   - Change ticket status (Editor+)
ticket.updatePriority - Change ticket priority (Editor+)
ticket.close          - Force close tickets (Editor+)
ticket.manageCannedResponses - CRUD canned responses (Administrator)
ticket.viewAnalytics  - View ticket analytics (Editor+)
ticket.viewInternalNotes - See internal notes (Author+)
```

Default role mapping:

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|-----------|--------------|--------|--------|-------------|------------|
| ticket.view | Yes | Yes | Yes | Yes | Yes |
| ticket.viewAll | Yes | Yes | - | - | - |
| ticket.respond | Yes | Yes | Yes | - | - |
| ticket.assign | Yes | Yes | - | - | - |
| ticket.updateStatus | Yes | Yes | - | - | - |
| ticket.updatePriority | Yes | Yes | - | - | - |
| ticket.close | Yes | Yes | - | - | - |
| ticket.manageCannedResponses | Yes | - | - | - | - |
| ticket.viewAnalytics | Yes | Yes | - | - | - |
| ticket.viewInternalNotes | Yes | Yes | Yes | - | - |

- [ ] **Step 2: Register email notification templates**

The following email templates should be registered in the Email Notification System for the event listener to use:

| Trigger | Recipient | Template Slug |
|---------|-----------|---------------|
| Admin replies (non-internal) | Ticket owner | `ticket_reply_notification` |
| User replies | Assigned admin | `ticket_user_reply` |
| Ticket assigned | Assigned admin | `ticket_assigned` |
| Ticket resolved | Ticket owner | `ticket_resolved` |

These are registered as event listeners in the Event Dispatcher System, triggered by `ticket.replied`, `ticket.assigned`, and `ticket.resolved` events.

- [ ] **Step 3: Register audit log actions**

The following actions should be logged through the Audit Log System. All ticket mutations already emit events, so the audit log event listener will pick them up automatically. Verify these event codes are handled by the audit log classification system:

```
ticket.created          -> "Ticket created"
ticket.replied          -> "Ticket reply"
ticket.assigned         -> "Ticket assigned"
ticket.status_changed   -> "Ticket status changed"
ticket.resolved         -> "Ticket resolved"
ticket.closed           -> "Ticket closed"
ticket.rated            -> "Ticket rated"
```

Check `ConvexPress-Admin/packages/backend/convex/helpers/auditClassification.ts` and `auditDescriptions.ts` to add ticket event handling.

- [ ] **Step 4: Add admin sidebar navigation**

Add the ticket system section to the admin sidebar navigation. Check the Admin Shell UI expert's configuration for where to add:

```
Support Tickets             <- NEW top-level section
  All Tickets               -> /admin/tickets
  Canned Responses          -> /admin/tickets/canned-responses
  Analytics                 -> /admin/tickets/analytics
  Settings                  -> /admin/tickets/settings
```

This is typically in the sidebar configuration in the Admin Shell UI system -- check `ConvexPress-Admin/apps/web/src/components/admin/` for the sidebar component.

- [ ] **Step 5: Register admin routes in the routing system**

Register the new admin routes in the routing system so that the RoutePermissionGuard can check access:

```
/admin/tickets                    -> ticket.viewAll
/admin/tickets/$ticketId          -> ticket.viewAll
/admin/tickets/canned-responses   -> ticket.manageCannedResponses
/admin/tickets/analytics          -> ticket.viewAnalytics
/admin/tickets/settings           -> settings.manage
```

- [ ] **Step 6: Verify end-to-end** -- Create a ticket from the website, verify it appears in the admin queue, reply to it, check events are emitted, verify SLA tracking, test CSAT rating.

**Commit:** `feat(tickets): integrate with event dispatcher, email notifications, audit log, and admin navigation`

---

## Summary

This plan implements the complete Ticket System across 20 tasks:

| Task | Description | Files |
|------|-------------|-------|
| 1 | Schema + Hub | `convex/schema/tickets.ts`, `convex/schema.ts` |
| 2 | Event Constants | `convex/events/constants.ts` |
| 3 | Validators | `convex/tickets/validators.ts` |
| 4 | Ticket CRUD | `convex/tickets/mutations.ts` |
| 5 | Ticket Queries | `convex/tickets/queries.ts` |
| 6 | Messages | `convex/tickets/messages.ts` |
| 7 | Canned Responses | `convex/tickets/cannedResponses.ts` |
| 8 | Sessions | `convex/tickets/sessions.ts` |
| 9 | Rate Limiting | `convex/tickets/rateLimit.ts` |
| 10 | Internals | `convex/tickets/internals.ts`, crons |
| 11 | Settings | `convex/tickets/settings.ts` |
| 12 | Admin Ticket Queue | `routes/tickets/index.tsx`, `TicketListTable.tsx` |
| 13 | Admin Ticket Detail | `routes/tickets/$ticketId.tsx`, `TicketDetail.tsx` |
| 14 | Admin Canned Responses | `routes/tickets/canned-responses.tsx` |
| 15 | Admin Analytics + Settings | `routes/tickets/analytics.tsx`, `routes/tickets/settings.tsx` |
| 16 | Website Support Landing | `routes/support/index.tsx` |
| 17 | Website My Tickets | `routes/support/tickets/index.tsx` |
| 18 | Website Ticket Thread | `routes/support/tickets/$ticketId.tsx` |
| 19 | Website Create Ticket | `routes/support/new.tsx` |
| 20 | Integration | Events, emails, audit, sidebar, routes |

All backend code lives in `ConvexPress-Admin/packages/backend/convex/`. The admin SPA owns the Convex database. The website is a consumer only.
