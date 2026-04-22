# PRD: Airtable Sync System

> **Project:** ConvexPress — unified CMS + commerce.
> **Roles:** WordPress-standard.
> **Stack:** Bun, Base UI, Tailwind v4, Airtable API.
> **Canonical path:** `specs/ConvexPress/systems/airtable-sync-system/PRD.md`
> **Airtable Record:** `recglJi9ihr059Xji`
> **Expert:** `/experts:airtable-sync-system` (to be created)
> **Status:** Scaffolded ~40%. Currently a blueprint-sync meta-tool that pulls the ConvexPress Airtable base down into local system records. Wave 11 expands scope (or narrows it) based on the product decision below.

---

## Integration with ConvexPress

**Positioning:** dual-mode internal extension (`airtableSync`).
**Code lives at:** `convex/airtableSync/` (11 files: internals, actions, syncCapabilities, syncEmailNotifications, syncEvents, syncRoles, syncRoutes, syncSiteNotifications).
**Admin UI:** `apps/web/src/routes/.../admin/tools/airtable/`.

**Consumes these ConvexPress systems:**

- **Role & Capability System** — `syncCapabilities` + `syncRoles` pull the canonical capability list from Airtable.
- **Routing System** — `syncRoutes` pulls route definitions.
- **Event Dispatcher** — `syncEvents` pulls the event catalog.
- **Email Notification System** — `syncEmailNotifications` pulls template metadata.
- **Site Notification System** — `syncSiteNotifications` pulls notification-type catalog.
- **Settings System** — `integrations.airtable` section holds API key + base ID + per-table preferences.
- **Audit Log** — sync runs logged.

**Airtable base:** `appqpJ8QQkoKsH02O` (ConvexPress blueprint base) with tables Systems, System Experts, Roles, Routes, Actions, Events, Action Types, Event Types, Email Notifications, Site Notifications.

---

## 1. Overview — product decision

The existing `airtableSync` code is a **blueprint meta-tool**: it pulls
canonical metadata from the Airtable base that defines ConvexPress's
architecture (72 systems, 137 actions, 63 events, 25 emails, 30 site
notifications, 5 roles, 70 routes). It is **not** a customer-content sync
feature.

**Two possible product scopes for Wave 11:**

### Scope A — "Internal blueprint meta-tool" (current)
Keep this system focused on pulling the blueprint into local records.
Useful when: (a) the project structure itself changes (a new system is
added in Airtable → `airtableSync` pulls it), (b) onboarding new sites
wants to start with the canonical capability/event/role catalog.

### Scope B — "Customer content sync"
Expand to pull customer Airtable content into ConvexPress CMS — e.g.,
synced blog posts, product listings, or event schedules. This mirrors
WordPress's Airtable plugins.

**Recommendation for Wave 11:** **Scope A only.** Rationale: customer
content sync is a separate product surface that competes with WordPress
Sync (more urgent for Woo migrations). Add Scope B as a deferred option.
Document the decision here so future Waves can reference it.

### 1.2 Scope (A-focused)

**In Scope:**
- Pull: blueprint Airtable tables (Roles, Capabilities, Routes, Events, Email Notifications, Site Notifications) → local ConvexPress records.
- One-way sync (Airtable → ConvexPress); no push back.
- Idempotent upserts keyed on Airtable record ID.
- Dry-run mode (show diffs without writing).
- Manual trigger via admin UI; optional scheduled cron.
- Error-log table for failed syncs.
- Rate-limit compliance with Airtable API (5 req/sec).
- Retry/backoff on transient failures.
- Conflict resolution: last-write-wins on field mismatches with history entry.

**Out of Scope:**
- Push sync back to Airtable (Airtable is treated as source of truth for the blueprint).
- Customer content sync (Scope B — deferred).
- Schema migration driven by Airtable changes (still admin-reviewed + code deploys).

---

## 2. Data Model

### 2.1 Exists
Sync writes to existing canonical tables:
- `roles`, `role_capabilities`
- `routes`
- `events` catalog (metadata, not the event-log)
- `email_templates` (already synced from Airtable fields)
- `site_notification_types`

### 2.2 Wave 11

```ts
airtable_sync_jobs: defineTable({
  startedBy: v.id("users"),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  status: v.union(
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("dry_run"),
  ),
  tablesSyncedCount: v.number(),
  recordsProcessed: v.number(),
  errorCount: v.number(),
}).index("by_status", ["status"]).index("by_started_at", ["startedAt"]);

airtable_sync_errors: defineTable({
  jobId: v.id("airtable_sync_jobs"),
  tableName: v.string(),
  airtableRecordId: v.optional(v.string()),
  errorMessage: v.string(),
  errorAt: v.number(),
}).index("by_job", ["jobId"]);

// Settings: integrations.airtable
{
  airtableApiKey: string,
  airtableBaseId: string,
  syncSchedule: "manual" | "daily" | "weekly",
  enabledTables: string[],
  lastSyncAt: number | null,
  lastSyncStatus: "success" | "failed" | "never_run",
}
```

---

## 3. Functions

### 3.1 Exists
- `airtableSync.actions.*` — Node action runners per table
- `airtableSync._internal.*` — helpers + validators
- `airtableSync.syncRoles`, `syncCapabilities`, `syncRoutes`, `syncEvents`, `syncEmailNotifications`, `syncSiteNotifications`

### 3.2 Wave 11
- `airtableSync.actions.runFullSync(jobId)` — orchestrator
- `airtableSync.actions.runDryRun` — returns diffs without writing
- `airtableSync.mutations.startJob / cancelJob`
- `airtableSync.queries.listJobs / getJobErrors`
- `airtableSync.internals.scheduleNextRun` — cron based on `syncSchedule`

---

## 4. Admin UI

### 4.1 Exists
- Ad-hoc sync buttons under Settings

### 4.2 Wave 11
- `/admin/tools/airtable/jobs` — list of past sync runs
- `/admin/tools/airtable/run` — run-dry-run-or-real form with table selector
- `/admin/tools/airtable/errors/$jobId` — error log

---

## 5. Events

- `airtable.sync_started / completed / failed / dry_run_completed`
- `airtable.field_dropped` — when a remote field doesn't map

---

## 6. Acceptance criteria

### 6.1 Existing
- [x] Per-table sync actions for Roles / Capabilities / Routes / Events / Emails / Site Notifications
- [x] Idempotent upsert

### 6.2 Wave 11
- [ ] `airtable_sync_jobs` + `airtable_sync_errors` tables
- [ ] Orchestrator + dry-run mode
- [ ] Scheduled runs via settings
- [ ] Rate-limit compliance with retry/backoff
- [ ] Admin UI for jobs + errors
- [ ] Explicit Scope A decision documented in the expert knowledge doc

---

## 7. References

- Code: `convex/airtableSync/*` (11 files)
- Airtable base: `appqpJ8QQkoKsH02O` (ConvexPress blueprint)
- Sibling PRDs: `settings-system`, `event-dispatcher-system`, `role-capability-system`, `routing-system`, `email-notification-system`, `site-notification-system`, `wordpress-sync-system` (for the content-sync pattern if Scope B ever lands)
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `recglJi9ihr059Xji`
