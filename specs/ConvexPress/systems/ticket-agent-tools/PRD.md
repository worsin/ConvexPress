# PRD: Ticket Agent Tools

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard. Agents are `Editor`-level or higher with `tickets.reply` + `tickets.assign` capabilities.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/ticket-agent-tools/PRD.md`
> **Airtable Record:** `recsE5X5x9mVGy4uW`
> **Expert:** `/experts:ticket-agent-tools` (may consolidate under `/experts:support-system`)
> **Status:** Shipped ~58%. Agent inbox + reply composer + assignment live; AI-assisted reply + customer context sidebar + collision detection Wave 11.

---

## Integration with ConvexPress

**Positioning:** the agent-facing UI layer of the `tickets` extension.
**Code lives at:**
- Backend shared with Ticket Lifecycle (`convex/tickets/*`).
- Admin UI: `ConvexPress-Admin/apps/web/src/routes/.../admin/support/*` + `ConvexPress-Admin/apps/web/src/components/support/*`.

**Consumes these ConvexPress systems:**

- **Ticket Lifecycle System** — reads + writes the same schema.
- **Customer System** — sidebar shows customer profile, order history, subscription, LTV.
- **Order System** — "Recent orders" panel on ticket detail.
- **Commerce Subscriptions** — "Active subscription" panel for subscription tickets.
- **KB Article System** — agent can drop article links into reply.
- **Canned Responses** (part of Ticket Lifecycle) — one-click snippet insertion.
- **AI Content Generation** — Wave 11: AI-suggested draft replies.
- **Event Dispatcher** — emits `ticket.agent_typing / agent_viewing / reply_drafted`.
- **Role & Capability** — `tickets.reply`, `tickets.assign`, `tickets.close`, `tickets.merge`, `tickets.manage_workflows`.

**SaaS analog:** HelpScout Mailbox agent view / Intercom Conversations / Zendesk Agent Workspace.

---

## 1. Overview

### 1.1 Purpose

Agent-facing tools to efficiently respond to customer tickets: unified
inbox, reply composer with canned responses + variable interpolation,
customer-context sidebar, ticket collision detection (two agents
typing), AI-assist, and keyboard-shortcut navigation.

### 1.2 Scope

**In Scope:**
- Agent inbox with filters: my tickets / unassigned / all open.
- Real-time list updates via Convex reactivity.
- Ticket detail with threaded messages + reply composer.
- Customer-context sidebar (profile, orders, subscriptions, past tickets).
- Canned response picker with variable substitution.
- Keyboard shortcuts (`R` reply, `C` close, `J/K` next/prev, `A` assign to me).
- Internal notes composer (agent-only).
- **Wave 11:** AI-assisted draft reply via AI Content Generation system.
- **Wave 11:** Collision detection — show "Agent X is viewing / typing" on shared tickets.
- **Wave 11:** Agent-availability toggle (online / away / offline).
- **Wave 11:** Round-robin assignment suggestion based on availability + current load.
- **Wave 11:** Ticket history viewer with diff (status changes, reassignments, tag changes).

**Out of Scope:**
- Ticket CRUD primitives → `ticket-lifecycle-system`.
- Customer widget → `ticket-widget-system`.
- Workflow rule evaluation → `ticket-lifecycle-system` (workflows).
- Analytics → `support-analytics-system`.

---

## 2. Data Model

### 2.1 Exists
`tickets_agent_stats` — denormalized per-agent counters.

### 2.2 Wave 11

```ts
tickets_agent_presence: defineTable({
  agentId: v.id("users"),
  status: v.union(
    v.literal("online"),
    v.literal("away"),
    v.literal("offline"),
  ),
  viewingTicketId: v.optional(v.id("tickets_tickets")),
  typingTicketId: v.optional(v.id("tickets_tickets")),
  lastHeartbeatAt: v.number(),
}).index("by_agent", ["agentId"]).index("by_status", ["status"]);
```

(Schema uses Convex's reactivity to show presence without polling.)

---

## 3. Functions

### 3.1 Exists
- Share mutations + queries with Ticket Lifecycle.

### 3.2 Wave 11
- `tickets.agent.presence.heartbeat(status, viewingTicketId?, typingTicketId?)` — 10s heartbeat from agent client
- `tickets.agent.queries.listPresence(ticketId)` — who is viewing + typing
- `tickets.agent.actions.suggestReply(ticketId)` — AI-assisted draft via AI Content Generation
- `tickets.agent.queries.roundRobinSuggest` — returns the agent with lowest current load who is online
- `tickets.agent.queries.historyWithDiff(ticketId)` — reads `tickets_history` with before/after diffs
- `tickets.agent.internals.expireStalePresence` — 1-min cron flips `offline` on stale heartbeats

---

## 4. Admin UI

### 4.1 Exists
- Inbox list
- Ticket detail with reply composer
- Canned-response picker

### 4.2 Wave 11
- Customer-context sidebar (orders, subscriptions, past tickets, notes)
- Keyboard shortcut overlay (press `?`)
- Presence indicators on ticket detail (avatars of currently-viewing agents)
- "Agent X is typing..." indicator
- AI-assist button with suggested draft in the composer
- Round-robin "Suggest assignee" button
- History timeline with diffs

---

## 5. Events

- `ticket.agent_viewing / agent_typing / agent_drafted`
- `ticket.ai_reply_suggested / ai_reply_accepted / ai_reply_edited`
- `ticket.collision_detected` — two agents replying simultaneously

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Agent inbox with filters
- [x] Reply composer + canned responses
- [x] Reassign / close / tag mutations
- [x] Per-agent stats counters

### 6.2 Wave 11
- [ ] Presence heartbeat + indicators
- [ ] AI-assisted draft reply
- [ ] Customer-context sidebar populated from Customer + Order + Subscription + past-ticket joins
- [ ] Keyboard shortcut overlay + navigation
- [ ] Round-robin assignee suggestion
- [ ] Collision-detection notification
- [ ] History timeline with diffs

---

## 7. References

- Code: `convex/tickets/*` (shared with Ticket Lifecycle)
- Admin UI: `apps/web/src/components/support/*`, `apps/web/src/routes/.../admin/support/*`
- Sibling PRDs: `ticket-lifecycle-system`, `ticket-widget-system`, `support-integration-system`, `support-analytics-system`, `support-deflection-system`, `customer-system`, `order-system`, `subscription-system`, `ai-content-generation`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recsE5X5x9mVGy4uW`
