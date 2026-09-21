# Routine settings and repair preserve listener choices

Root observed a normal `settings/mutations:updateSection` save of `email.enabled=false` schedule the old `bootstrap.registerListeners.run` migration. That migration reactivated the deliberately disabled LMS enrollment/completion email handlers and rewrote existing default-listener settings. Global email remained disabled in root's live test, but the saved listener choices were lost.

Repaired every routine call found in current source:

- `packages/backend/convex/settings/mutations.ts`: email saves schedule `internal.bootstrap.registerListeners.ensureRequired`.
- `packages/backend/convex/emails/mutations.ts`: `repairSystem` calls `registerListenerDefinitions` with `preserveExisting:true`.
- Desktop installation already calls missing-only `ensureRequired`; no change needed there.
- `settings.importAll` has no equivalent registration callback; its existing behavior preserves listener records and is covered explicitly.

The old `registerListeners.run` remains an explicit migration entry point. It is now clearly documented as reactivating and rewriting definitions. A source search found no remaining routine scheduler/caller invoking that mode. New-listener instructions now point to `ensureRequired`.

Actual-handler regressions seeded all 155 defaults, disabled both `lms.enrolled` and `lms.course_completed` email handlers, and customized their priority/retry/description/timestamps. They invoke the real email settings save/import/repair handlers. The test scheduler captures unrelated background work but explicitly executes whichever listener-registration callback the save scheduled; this reproduced the former migration behavior before the fix. Every existing listener record remains exactly unchanged after the repaired calls, and no email queue rows are created. Existing bootstrap tests separately verify missing definitions are added.

During this repair root reported a second partial-save failure: general settings validation required omitted `siteTitle` before the merge. Update/import now validate the complete candidate while leaving supplied-secret encryption semantics intact. Tests use the real validator and prove a date-format-only change preserves saved title, tagline and origin; an explicitly empty title still fails.

Validation: combined settings/bootstrap/notification suite 37 tests passed / 316 assertions; backend TypeScript and scoped whitespace checks passed. Root owns deployment and restoring the two intended live staging listener flags. This agent made no live database, browser, provider, deployment, or email calls.
