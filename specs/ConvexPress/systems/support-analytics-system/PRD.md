# PRD: Support Analytics System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4.
> **Canonical path:** `specs/ConvexPress/systems/support-analytics-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]`
> **Expert:** `/experts:support-analytics-system` (may consolidate under `/experts:support-system`)
> **Status:** Shipped ~45%. Basic metrics exist; full dashboard + SLA breach detection Wave 11.

---

## Integration with ConvexPress

**Positioning:** part of the `support` + `tickets` extensions.
**Code lives at:** `convex/support/analytics.ts` + `schema/tickets.ts:tickets_*` tables.
**Admin UI:** `apps/web/src/routes/.../admin/support/analytics/`.

**Consumes these ConvexPress systems:**

- **Ticket Lifecycle System** — reads `tickets_tickets` and `tickets_messages` for counts + times.
- **Ticket Agent Tools** — reads per-agent stats for scoreboard.
- **KB Search & Analytics** — joins `kb_searchQueries` to attribute deflected tickets.
- **Support Deflection System** — reads deflection events.
- **Users + Customer System** — joins to segment by plan tier.
- **Analytics System** — optional roll-up into site-wide KPIs.
- **Event Dispatcher** — listens on `ticket.*` events to build real-time counters.

**SaaS analog:** HelpScout / Intercom / Zendesk Explore — inbox-health dashboards with SLA compliance, first-response time, resolution time, CSAT.

---

## 1. Overview

### 1.1 Purpose

Give support admins visibility into inbox health: open ticket count,
time-to-first-response, time-to-resolution, CSAT, deflection rate, per-
agent throughput, SLA breach alerts, and channel-mix (email vs chat vs
form).

### 1.2 Scope

**In Scope:**
- Open ticket counts by status / priority / tag.
- Median + P95 first-response time (FRT) + resolution time (RT).
- CSAT (Customer Satisfaction) from ticket-closure surveys.
- Per-agent ticket counts + FRT + CSAT.
- Channel mix (email / chat / form).
- **Wave 11:** SLA breach detector (cron) emitting `support.sla_breached`.
- **Wave 11:** Deflection rate — % of support widget opens that resolve without creating a ticket (joins KB Search + Ticket Widget).
- **Wave 11:** Time-series charts (daily rolling) with date-range picker.
- **Wave 11:** Agent scoreboard with gamification-lite metrics.
- **Wave 11:** Export CSV + JSON.

**Out of Scope:**
- Ticket CRUD → `ticket-lifecycle-system`.
- Widget UX → `ticket-widget-system`.
- Deflection logic → `support-deflection-system`.

---

## 2. Data Model

### 2.1 Exists
- `tickets_tickets` — header
- `tickets_messages` — conversation
- `tickets_agent_stats` — denormalized per-agent rollups
- `tickets_csat_responses` — post-close survey responses

### 2.2 Wave 11

```ts
support_sla_policies: defineTable({
  name: v.string(),
  firstResponseMinutes: v.number(),
  resolutionMinutes: v.number(),
  [redacted-airtable-base-id]: v.optional(v.array(v.string())),
  appliesToTags: v.optional(v.array(v.string())),
  isActive: v.boolean(),
}).index("by_active", ["isActive"]);

support_sla_breaches: defineTable({
  ticketId: v.id("tickets_tickets"),
  policyId: v.id("support_sla_policies"),
  breachType: v.union(v.literal("first_response"), v.literal("resolution")),
  breachedAt: v.number(),
  resolvedAt: v.optional(v.number()),
  notifiedAt: v.optional(v.number()),
}).index("by_ticket", ["ticketId"]).index("by_breached_at", ["breachedAt"]);

support_metrics_daily: defineTable({
  date: v.string(),
  openTicketsCount: v.number(),
  newTicketsCount: v.number(),
  resolvedTicketsCount: v.number(),
  medianFrtMinutes: v.optional(v.number()),
  p95FrtMinutes: v.optional(v.number()),
  medianRtMinutes: v.optional(v.number()),
  csatScore: v.optional(v.number()),
  deflectionRate: v.optional(v.number()),
  slaBreachCount: v.number(),
}).index("by_date", ["date"]);
```

---

## 3. Functions

### 3.1 Exists
- `support.analytics.getInboxHealth` — current-moment snapshot
- `support.analytics.getAgentStats(agentId)`
- `support.analytics.getCsatScore(dateRange)`

### 3.2 Wave 11
- `support.analytics.queries.timeseries(metric, dateRange, granularity)`
- `support.analytics.queries.topTags(dateRange)` — tag distribution
- `support.analytics.queries.channelMix(dateRange)`
- `support.analytics.queries.deflectionRate(dateRange)` — joins KB + widget opens
- `support.analytics.internals.detectSlaBreaches` — 15-min cron
- `support.analytics.internals.aggregateDaily` — nightly cron → `support_metrics_daily`
- `support.sla.policies.*` — CRUD for SLA policies
- `support.analytics.queries.exportTickets(dateRange, format)` — CSV/JSON

---

## 4. Admin UI

### 4.1 Exists
- `/admin/support/analytics` — stub snapshot

### 4.2 Wave 11
- Full dashboard with time-series charts, date-range picker
- SLA breaches panel
- Agent scoreboard
- Deflection panel
- Export button

---

## 5. Events

- `support.sla_breached / resolved`
- `support.metrics_aggregated_daily`
- `support.csat_submitted`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Open-ticket count
- [x] FRT + RT calculation
- [x] CSAT collection
- [x] Per-agent stats

### 6.2 Wave 11
- [ ] SLA policies CRUD
- [ ] SLA breach detection cron + admin alert
- [ ] `support_metrics_daily` nightly aggregation
- [ ] Time-series charts
- [ ] Deflection-rate computation joining KB search + widget
- [ ] Export CSV/JSON

---

## 7. References

- Code: `convex/support/analytics.ts`
- Schema: `convex/schema/tickets.ts`
- Sibling PRDs: `ticket-lifecycle-system`, `ticket-agent-tools`, `ticket-widget-system`, `support-deflection-system`, `support-integration-system`, `kb-search-and-analytics`, `analytics-system`
- Airtable: `[redacted-airtable-base-id]` / Systems / `[redacted-airtable-record-id]`
