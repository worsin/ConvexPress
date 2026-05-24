You are a **BUILDER**. Your job is to implement the Event Dispatcher System for ConvexPress -- the central event bus and inter-system communication backbone, equivalent to WordPress's hooks system (`do_action()` / `add_action()`).

---

## MISSION

Build and complete the Event Dispatcher System: the foundational infrastructure layer that every other system depends on for emitting events and routing them to listeners (Email Notifications, Site Notifications, Audit Log). The core schema, mutations, queries, helpers, and constants are already built. Your job is to finish the remaining gaps: real handler dispatch (replacing the stub), the cron cleanup, the listener bootstrap, and frontend type/constant files.

---

## CURRENT STATUS: PARTIAL

| Component | Status | Notes |
|-----------|--------|-------|
| Schema (`convex/schema/events.ts`) | DONE | 3 tables, all 15 indexes, integrated in `schema.ts` hub |
| `convex/events/mutations.ts` | DONE | emit, registerListener, removeListener |
| `convex/events/queries.ts` | DONE | list, get, countByCode, listListeners, hasListener |
| `convex/events/internals.ts` | PARTIAL | processEvent + retryExecution exist but handler dispatch is STUB |
| `convex/events/validators.ts` | DONE | All arg shapes, status validators |
| `convex/events/constants.ts` | DONE | All 64 event codes, wildcard matching, retention policy |
| `convex/helpers/events.ts` | DONE | `emitEvent()` helper fully wired |
| `convex/helpers/eventFilter.ts` | DONE | `evaluateFilter()` + `isValidFilterCondition()` |
| `convex/helpers/eventRetry.ts` | DONE | `calculateRetryDelay()`, `shouldRetry()`, `getNextRetryAt()` |
| `convex/schema/eventDefinitions.ts` | DONE | Airtable sync definition table |
| `convex/eventDefinitions/queries.ts` | DONE | list, get, counts for blueprint data |
| `convex/airtableSync/syncEvents.ts` | DONE | Syncs 63 event defs from Airtable |
| Admin route `tools/events.tsx` | DONE | Displays eventDefinitions from Airtable |
| Admin component `EventsListTable.tsx` | DONE | List table for event definitions |
| Cron cleanup | MISSING | Daily retention cleanup not implemented |
| Listener bootstrap | MISSING | One-time listener registration not implemented |
| Real handler dispatch | MISSING | internals.ts uses stubs instead of real dispatch |
| Frontend types (`lib/events/types.ts`) | MISSING | No frontend TypeScript types |
| Frontend constants (`lib/events/constants.ts`) | MISSING | No frontend event code constants |

---

## PRD & KNOWLEDGE REFERENCES

- **Knowledge Document:** `.claude/docs/EVENT-DISPATCHER-SYSTEM.md` -- READ THIS FULLY before any work
- **PRD:** No dedicated system PRD file exists. The knowledge doc serves as the comprehensive specification.
- **Airtable Blueprint:** Base `appqpJ8QQkoKsH02O`, Events table `tblDQOlXXJO1aQapT` (63 records)

---

## FILES YOU OWN

### Backend -- Schema (DONE)
1. `ConvexPress-Admin/packages/backend/convex/schema/events.ts` -- DONE -- 3 tables: events, eventListeners, eventListenerExecutions (198 lines)
2. `ConvexPress-Admin/packages/backend/convex/schema/eventDefinitions.ts` -- DONE -- Airtable-synced event definition table (59 lines)

### Backend -- Functions (PARTIAL)
3. `ConvexPress-Admin/packages/backend/convex/events/mutations.ts` -- DONE -- emit, registerListener, removeListener (192 lines)
4. `ConvexPress-Admin/packages/backend/convex/events/queries.ts` -- DONE -- list, get, countByCode, listListeners, hasListener (306 lines)
5. `ConvexPress-Admin/packages/backend/convex/events/internals.ts` -- PARTIAL -- processEvent + retryExecution exist but handler dispatch is STUB (434 lines)
6. `ConvexPress-Admin/packages/backend/convex/events/validators.ts` -- DONE -- All shared arg validators (144 lines)
7. `ConvexPress-Admin/packages/backend/convex/events/constants.ts` -- DONE -- Event codes, system slugs, wildcards, retention (389 lines)
8. `ConvexPress-Admin/packages/backend/convex/eventDefinitions/queries.ts` -- DONE -- list, get, counts (90 lines)
9. `ConvexPress-Admin/packages/backend/convex/airtableSync/syncEvents.ts` -- DONE -- Airtable sync action (119 lines)

### Backend -- Helpers (DONE)
10. `ConvexPress-Admin/packages/backend/convex/helpers/events.ts` -- DONE -- `emitEvent()` universal helper (174 lines)
11. `ConvexPress-Admin/packages/backend/convex/helpers/eventFilter.ts` -- DONE -- `evaluateFilter()` + `isValidFilterCondition()` (92 lines)
12. `ConvexPress-Admin/packages/backend/convex/helpers/eventRetry.ts` -- DONE -- `calculateRetryDelay()`, `shouldRetry()`, `getNextRetryAt()` (80 lines)

### Backend -- MISSING
13. `ConvexPress-Admin/packages/backend/convex/crons.ts` or `convex/crons/eventCleanup.ts` -- MISSING -- Daily retention cleanup cron
14. `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts` -- MISSING -- One-time listener registration for all systems

### Admin Frontend (PARTIAL)
15. `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tools/events.tsx` -- DONE -- Route file (26 lines)
16. `ConvexPress-Admin/apps/web/src/components/tools/EventsListTable.tsx` -- DONE -- List table component (219 lines)
17. `ConvexPress-Admin/apps/web/src/lib/events/types.ts` -- MISSING -- Frontend TypeScript types
18. `ConvexPress-Admin/apps/web/src/lib/events/constants.ts` -- MISSING -- Frontend event code constants (may re-export from backend)

---

## ABSOLUTE RULES

1. **Schema is in `convex/schema/events.ts` only** -- NEVER put table definitions directly in `schema.ts`. The hub file only imports and spreads. The events schema is already correctly placed.

2. **NEVER deploy** -- You write code only. The Convex Deployment Expert (`/experts:convex-deployment`) handles all deployment. Note any schema changes or new files that need deployment.

3. **Event emission is transactional** -- `emitEvent()` runs inside the same Convex mutation as the triggering action. If the mutation rolls back, the event is never persisted. NEVER break this guarantee.

4. **The dispatcher NEVER emits events** -- No recursive self-triggering. The 3 mutations (emit, registerListener, removeListener) and all bootstrap operations are event-free.

5. **Guard against circular event chains** -- Enforce maximum event depth of 5 levels using `parentEventId`. Check depth before emitting cascading events.

6. **Payloads are JSON strings capped at 100KB** -- Include IDs and essential fields only. Let listeners fetch full data themselves.

7. **processEvent must be idempotent** -- Check `status !== "pending"` before processing to prevent duplicate execution from scheduler retries.

8. **Handler dispatch pattern** -- When replacing the stub in `internals.ts`:
   - `"internal"` handlers: schedule via `ctx.scheduler.runAfter(0, handler, args)`
   - `"action"` handlers: schedule via `ctx.scheduler.runAfter(0, handler, args)`
   - `"scheduled"` handlers: schedule via `ctx.scheduler.runAfter(delayMs, handler, args)`
   - Handler references are resolved from `handlerModule` + `handlerFunction` fields on the listener record
   - The current stub correctly marks executions as completed -- real dispatch must handle the same success/failure state transitions

---

## VERIFICATION CHECKLIST

Before declaring any task complete, verify:

- [ ] Schema file `convex/schema/events.ts` defines 3 tables with all 15 indexes (already done)
- [ ] Schema is imported and spread in `convex/schema.ts` hub (already done)
- [ ] `emitEvent()` helper validates code format, resolves actor, queries listeners (exact + wildcard + global), inserts event + executions, schedules processing (already done)
- [ ] `processEvent` internal function: idempotency guard, filter evaluation, handler dispatch (handler dispatch is STUB -- needs completion)
- [ ] `retryExecution` internal function: retry logic with backoff (exists, also STUB dispatch)
- [ ] All 5 queries work: list (with filters), get (with executions), countByCode, listListeners, hasListener (already done)
- [ ] All 3 mutations work: emit (with validation), registerListener (with dedup), removeListener (soft delete) (already done)
- [ ] Retention cleanup cron deletes expired events in batches of 100 (MISSING)
- [ ] Listener bootstrap script registers all system listeners via upsert (MISSING)
- [ ] Frontend types file exists at `src/lib/events/types.ts` (MISSING)
- [ ] Frontend constants file exists at `src/lib/events/constants.ts` (MISSING)
- [ ] No `@radix-ui` imports anywhere
- [ ] No hardcoded colors (zinc, slate, gray) in any frontend file
- [ ] Event codes match the canonical list in `events/constants.ts`

---

## RELATED EXPERTS

| Expert | Relationship |
|--------|-------------|
| `/experts:email-notification-system` | Hard dependency -- registers listeners for 25 email templates triggered by events |
| `/experts:site-notification-system` | Hard dependency -- registers listeners for 30 site notification types |
| `/experts:audit-log-system` | Hard dependency -- registers global wildcard listener (`*`) for all events |
| `/experts:post-system` | Medium dependency -- calls `emitEvent()` for post lifecycle events |
| `/experts:comment-system` | Medium dependency -- calls `emitEvent()` for comment lifecycle events |
| `/experts:convex-deployment` | Deploys all schema and function changes after implementation |

---

$ARGUMENTS
