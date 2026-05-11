# PRD: Ticket Lifecycle System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/ticket-lifecycle-system/PRD.md`
> **Airtable Record:** `recoAjLPxxlGwWgsm`
> **Expert:** `/experts:ticket-lifecycle-system` (may consolidate under `/experts:support-system`)
> **Status:** Shipped ~70%. Core CRUD + messages + status machine live; workflow rules + escalation + bulk actions Wave 11.

---

## Integration with ConvexPress

**Positioning:** internal extension (`tickets`).
**Extension gate:** `tickets.ticketsEnabled` in Settings.
**Code lives at:** `convex/tickets/` (11 files: internals, mutations, queries, messages, sessions, cannedResponses, rateLimit, settings, validators, integration) + `schema/tickets.ts`.
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/.../admin/support/` (inbox view + ticket detail).

**Consumes these ConvexPress systems:**

- **Users + Customer System** — tickets are filed by `users._id` or guest `customerEmail`.
- **Order System** — tickets can attach to an order for context.
- **Email Notification System** — ticket emails: created / replied / resolved / escalated.
- **Support Integration System** — inbound channels create tickets via `tickets.create`.
- **Ticket Agent Tools** — agent-side UI consumes the same mutations.
- **Ticket Widget System** — customer-facing widget creates + continues tickets.
- **Support Deflection System** — deflection runs before ticket creation.
- **KB Article System** — canned responses can link articles.
- **Audit Log** — every status transition logged.
- **Event Dispatcher** — emits `ticket.created / replied / status_changed / assigned / escalated / resolved / closed`.

**SaaS analog:** HelpScout Mailbox / Zendesk Support / Freshdesk — email-driven multi-channel ticket lifecycle with assignment + status machine.

---

## 1. Overview

### 1.1 Purpose

The Ticket Lifecycle System is the core CRUD + state-machine layer for
customer support tickets. Creating a ticket, threading replies, changing
status (open → pending → resolved → closed), assigning to agents,
applying tags + priority, and enforcing SLA deadlines.

### 1.2 Scope

**In Scope:**
- Ticket CRUD (create, update status, close, reopen).
- Message threading (customer replies + agent replies).
- Status machine: `open → pending → on_hold → resolved → closed` (+ `reopened`).
- Priority: `low | normal | high | urgent`.
- Tags (many-to-many).
- Assignment to a single agent; reassignment.
- Canned responses (stored snippets with variable interpolation).
- Session helpers for rate-limiting customer submissions.
- Attachment support (linked `media` rows).
- Internal notes (agent-only, never emailed).
- **Wave 11:** Workflow rules — auto-tag, auto-assign, auto-escalate based on conditions.
- **Wave 11:** Scheduled follow-ups ("remind me in 24h").
- **Wave 11:** Bulk actions (close 50 tickets, merge tickets, reassign batch).
- **Wave 11:** Ticket merging (two tickets become one with combined history).

**Out of Scope:**
- Inbound channel adapters → `support-integration-system`.
- Agent console UI → `ticket-agent-tools`.
- Customer widget → `ticket-widget-system`.
- Deflection → `support-deflection-system`.
- Analytics + SLA reporting → `support-analytics-system`.

---

## 2. Data Model

### 2.1 Exists (in `schema/tickets.ts`)

```ts
tickets_tickets           // header with status, priority, assignee, tags
tickets_messages          // threaded messages (customer + agent + internal_note)
tickets_tags              // tag library
tickets_ticket_tags       // junction
tickets_canned_responses  // snippets with variable placeholders
tickets_sessions          // rate-limit sessions for guest submitters
tickets_history           // status transition audit log
```

### 2.2 Wave 11

```ts
tickets_workflow_rules: defineTable({
  name: v.string(),
  trigger: v.union(
    v.literal("on_create"),
    v.literal("on_update"),
    v.literal("on_reply"),
    v.literal("scheduled"),
  ),
  conditions: v.any(),                 // serialized expression
  actions: v.any(),                    // { assignTo, addTags, setPriority, ... }
  isActive: v.boolean(),
  runCount: v.optional(v.number()),
}).index("by_active", ["isActive"]).index("by_trigger", ["trigger"]);

tickets_scheduled_followups: defineTable({
  ticketId: v.id("tickets_tickets"),
  agentId: v.id("users"),
  followUpAt: v.number(),
  note: v.string(),
  completedAt: v.optional(v.number()),
}).index("by_follow_up_at", ["followUpAt"]);

tickets_merges: defineTable({
  sourceTicketId: v.id("tickets_tickets"),
  targetTicketId: v.id("tickets_tickets"),
  mergedBy: v.id("users"),
  mergedAt: v.number(),
}).index("by_source", ["sourceTicketId"]).index("by_target", ["targetTicketId"]);
```

---

## 3. Functions

### 3.1 Exists
- `tickets.mutations.create / reply / updateStatus / assign / tag / untag`
- `tickets.mutations.addInternalNote / addAttachment`
- `tickets.queries.list / getById / listForUser / listByAssignee / listByTag`
- `tickets.messages.listForTicket / markRead`
- `tickets.cannedResponses.list / get / applyToDraft`
- `tickets.sessions.*` — rate-limit helpers

### 3.2 Wave 11
- `tickets.workflowRules.evaluate(event, ticket)` — runs matching rules + applies actions
- `tickets.mutations.scheduleFollowUp(ticketId, agentId, followUpAt, note)`
- `tickets.mutations.bulkUpdateStatus(ticketIds, newStatus)`
- `tickets.mutations.merge(sourceTicketId, targetTicketId)`
- `tickets.internals.runScheduledFollowUps` — 15-min cron
- `tickets.workflowRules.mutations.create / update / delete / toggle`
- `tickets.queries.listMergeCandidates(ticketId)` — fuzzy match on email + subject

---

## 4. Admin UI

### 4.1 Exists
- `/admin/support/inbox` — list + filter
- `/admin/support/tickets/$id` — detail with reply composer
- Canned-response picker in composer

### 4.2 Wave 11
- Workflow-rules CRUD at `/admin/support/workflows`
- Scheduled follow-ups panel on ticket detail
- Bulk-action toolbar on inbox
- Merge modal with side-by-side diff

---

## 5. Events

- `ticket.created / replied / status_changed / assigned / tagged / merged`
- `ticket.internal_note_added`
- `ticket.follow_up_scheduled / follow_up_fired`
- `ticket.workflow_rule_matched`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] CRUD + threaded messages
- [x] Status machine
- [x] Priority + tags
- [x] Assignment
- [x] Canned responses
- [x] Rate-limit sessions
- [x] Attachments
- [x] Internal notes
- [x] History audit log

### 6.2 Wave 11
- [ ] Workflow rules engine with CRUD
- [ ] Scheduled follow-ups + 15-min cron
- [ ] Bulk actions (status change, reassign, tag)
- [ ] Ticket merging with history preservation
- [ ] Admin UI for all of the above

---

## 7. References

- Code: `convex/tickets/*` (11 files)
- Schema: `convex/schema/tickets.ts`
- Sibling PRDs: `support-integration-system`, `ticket-agent-tools`, `ticket-widget-system`, `support-deflection-system`, `support-analytics-system`, `email-notification-system`, `customer-system`, `order-system`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recoAjLPxxlGwWgsm`
