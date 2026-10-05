# Canonical-first native creation — 2026-10-05

The normal New post and New page routes now call `canonicalDocuments.create`. One transaction creates an empty canonical draft at revision1, validates its installed presentation and emits the existing created event. It preserves selected-site authority, slug uniqueness, reserved page routes, media/consumer write guards and separate publication. No legacy placeholder record or placeholder revision is persisted. First accepted edits advance to revision2 and preserve a canonical revision1 snapshot.

The endpoint accepts only type and title. Archived source import remains deliberate. The old generic create APIs, Dashboard Quick Draft and other legacy writers are not retired by this batch. Quick Draft is a confirmed next active caller: `convex/dashboard/mutations.ts:quickDraft` writes a raw content string without canonical fields, and its live widget calls it. Full E07 and the delivery goal remain incomplete.

## Tests and builds

Evidence lives in `output/canonical-create-20261005/`.

- New workflow tests first failed because canonical creation did not exist. Four new tests cover post/page create→get→save→history, slug uniqueness and page path, capability denial, invalid title/legacy payload/reserved route refusal, no publication events, and rollback after insertion when installed site presentation is unavailable. The test initially assumed a `state` property on the authoring DTO; it was corrected to assert the documented canonical blocks/revision contract.
- Working/source143 tests1497assertions, preserved target113tests999assertions: document lifecycle, authoring fence and consumer-index suites.
- Admin mounted route/workspace/private-autosave wrappers all pass. These are three wrapper tests, not a claim of only three child cases.
- Explicit backend type check, both deployment type checks, Admin and Website type checks pass. Admin production build passes with the existing chunk-size warning. Writer and generated API contracts regenerated; the new create writer is explicitly reviewed in permit coverage.
- The previous Website artifact remains valid and was reused: this change adds a backend mutation and Admin routes, with no Website runtime behavior change.

## Installation preservation

Both installations were exported with file storage before deployment. Each was patched from its own previous history-retirement snapshot; no source overlay on target.

Source:1626 hashes,108 extension files including tests exact, catalog/packs exact. Functions2412→2413; only `canonicalDocuments.js:create` added;2412 existing signatures unchanged.

Target:1620 hashes,86 extension files including tests exact, catalog/packs exact. Functions2377→2378; only the same create endpoint added;2377 existing signatures unchanged.

Consumer indexes rebuilt with243/68 acknowledged operations respectively; both consumer and media indexes ready before acceptance. Authoritative preservation bases for the next deployment are `output/canonical-create-20261005/{source,target}-source-installed.json`, with snapshot-root-relative hashes and separate `ConvexPress-Admin/output/production-checkpoints/{source,target}-canonical-create-20261005` roots.

## Actual native acceptance

In the owned Electron window, both New post and New page on both sites opened canonical authoring directly, with a stable edit URL and no initialization button. Each accepted an inserted Paragraph and title, saved, reloaded and rendered the exact authored text in its actual Website preview. All four reached revision2; each history contains exactly one empty canonical snapshot. Preview335px has no horizontal overflow or page/console errors. Screenshots were inspected; narrow Admin chrome horizontal scrolling remains a separate known observation.

The first source post was left open long enough to autosave intermediate input. Immediately reloading after accepted Save reoffered that older private draft because the separate1500ms debounced cleanup had not completed. The saved title/body were verified intact, the owned private draft was explicitly discarded, and preview then passed. Other three flows reopened directly. This is evidence for a follow-up to make accepted-save/private-draft cleanup generation-safe across immediate reload and concurrent devices; it is not claimed fixed by creation. Existing autosave safety tests remain green.

A harness initially treated the Browse blocks summary disclosure as a button; it was corrected to the actual summary and no content write was replayed.

## Cleanup

Four owned documents/four history rows and all their private drafts were deleted after native signout. Source116posts/434revisions and target29posts/88revisions match the baseline exactly; appearance, email queue/templates and other private drafts are unchanged. API sessions revoked. Owned Electron65615, Websites65601/65863 and isolated profile cleaned. Owner39198/62672/65092 processes and separate RSVP fixtures preserved. No publication or push.

Latest observed Claude audit35 remains advisory; its count clarification is already addressed. Next bounded work is Quick Draft and reachable legacy API writers, plus the demonstrated private-autosave cleanup timing boundary. No whole-application audit expansion.
