# Fresh installation listener bootstrap

The desktop initializer configured management identity and seeded roles, but never registered event listeners. Fresh installations therefore had no default audit, notification, search, sitemap, menu, or routing subscriptions. Existing email-settings flows registered them incidentally. Root observed an authorized empty active-listener inventory on Aster House staging; no learning authoring writes had occurred.

`bootstrap/registerListeners:ensureRequired {}` now inserts missing default definitions. It identifies existing records by event code and name, preserves their entire records (including inactive status and custom handlers), and skips legacy migration/deactivation. Per-event lookup stops with an error above 1,000 records instead of reconciling incomplete reads. The desktop `ipc/siteDeploy.ts` initialization path invokes it after role seeding with the same target credentials, cancellation, timeout, and progress handling.

The older `bootstrap/registerListeners:run` retains its explicit migration behavior, including reactivation and configuration updates. It must not be used for a missing-only installation repair.

Registration does not read, replay, or schedule historical events. The dispatcher loads the execution records established when an event was emitted; adding listeners does not add executions to old events. An actual-handler test invokes that dispatcher after registration and verifies an old pending event completes without invoking any new listener. Existing independently queued work is not canceled or altered by registration.

The prepared Aster House driver now brackets the complete `events/queries:listListeners` inventory with strict `auditLogs/queries:list {limit:1}` authorization probes. This distinguishes authorized emptiness from the listener query's permission-denied empty response without assuming any particular bootstrap row. Matching unreviewed handlers still stop authoring. Reviewed internal effects include local search indexing; its handler schedules only local `searchIndex` maintenance. An in-memory bootstrap created 155 defaults and all passed the driver's event-specific policy. Other writers must not change event listeners during authoring.

Validation:

- Regression tests initially failed because `ensureRequired` did not exist.
- Actual bootstrap/dispatcher handlers and notification registry: 6 tests passed, 166 assertions. Covers fresh defaults, unchanged rerun, partial repair, preserved disabled/customized/obsolete records, and no historical event execution or scheduling.
- Backend and Electron TypeScript checks passed. The new registration uses runtime args/returns validators and the same localized generated-schema TS2589 workaround as the existing migration registration.
- Driver static contract check: 22 public APIs passed; no authenticated client constructed or authoring driver invoked. Syntax and scoped whitespace checks passed.

Root's next live step: deploy the repaired backend, invoke the internal missing-only function with protected target credentials on the exact staging deployment, read back the listener inventory, then rerun the resumable authoring driver. This agent made no live database, provider, browser, or deployment calls.

Root subsequently reported 155 live listeners and a course readback failure. The driver compared serialized JSON strings, while Convex reordered object keys. Replaced that comparison with recursive JSON-data equality, sorting object keys while preserving array order and primitive types. A first use of Node deep equality also rejected cross-realm objects from the live REPL; the final comparator ignores object prototypes. Regressions cover nested key ordering, another Node VM realm, missing versus null fields, primitive types, reversed paragraphs, changed prose, and extra fields. Root's exact saved live course comparison fixture passes, including a cross-realm copy. Saved course identity can resume without recreating it. Live execution remains root-owned.
