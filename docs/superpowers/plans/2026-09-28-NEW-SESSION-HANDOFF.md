# ConvexPress — new session handoff

Prepared September 28, 2026 at the owner's request. The previous task was explicitly STOPPED. This document hands off work; it does not authorize the old task to resume or copy its giant conversation into the new task.

## Goal to create in the new session

Finish and deliver the ConvexPress block editor and template system specified in the two Claude handoffs and the owner's requirements. Complete all 137 tracked blocks; native Electron authoring, nesting, autosave/history/recovery and actual Website preview; canonical content migration and required legacy retirement; template activation and the full Customizer including header/footer/menu, presets, conflicts, operator authority and staging appearance promotion; four polished default packs (Core, Journal, Depot, Aster House), each with a complete authored example website; an organized internal BlockDemo showing every block and its template styling; and the required block/template/plugin SDK, live resolver/action, AI composition, per-pack styling and canonical promotion workflows.

Fix every demonstrated dependency necessary for that delivery, including backend, auth, data, deployment and build defects. Before expanding into a dependency, identify the failed required workflow, prove the causal connection, define the repair boundary and specify the check that ends the investigation. Do not expand back into an unrelated whole-application production audit. Preserve separate databases per website/environment, customer/operator separation, existing content and sessions. Work in the existing hardening checkout, reuse valid evidence, batch verification and safely integrate completed work locally. No push. Complete only when the actual editor/templates/sites/demo/SDK work end to end; do not infer completion from file or test counts.

## Authoritative source and plan

- Worktree: `/Users/worsin/.codex/worktrees/convexpress-hardening`
- Branch: `codex/convexpress-hardening`
- User checkout: `/Users/worsin/Development/ConvexPress`
- Last committed HEAD: `9824d9605e50c4b0ebd711c13715b506f8ef5bd3`
- That commit adds the focused execution guide/status inventory and scope correction. Both checkouts were clean before this handoff was added.
- This handoff is saved in both checkouts and is deliberately uncommitted. Do not mistake it for an unrelated user edit or delete it.

Read these in order, using the worktree paths:

1. `docs/superpowers/plans/2026-09-28-editor-template-delivery.md` — complete eight-stage execution guide, 18 known blocker/gap categories, source map, test strategy and exit criteria.
2. `docs/superpowers/plans/2026-09-28-editor-template-status.json` — all 137 exact block names and checkpoint statuses.
3. `specs/handoffs/HANDOFF-ASTRA-2026-09-04.md` — template/Customizer/SDK requirements.
4. `specs/handoffs/HANDOFF-ASTRA-BLOCKS-2026-09-05.md` — canonical block/editor requirements, phases 0–6.
5. `ConvexPress-Admin/audits/2026-09-04/current-acceptance.md` — current evidence index, with the September 28 scope correction at the top.

The historical implementation ledger is over 3,000 lines. Search relevant sections rather than rereading all of it. Do not load the old session transcript: it grew to roughly 1.2GB and contributed to severe UI overhead. Detailed old cost accounting is in `output/work-accounting-20260928/ACCOUNTING.md` only if needed.

## Real completion state

- 137 canonical specifications and renderers exist.
- 58 blocks are Verified; 79 are In progress at the last exact tracker readback.
- Pending means missing implementation, a known defect, incomplete evidence or an external prerequisite; it does NOT mean 79 empty blocks.
- Four installed packs: Core, Journal, Depot, Aster House.
- Recorded inventory: 285 canonical examples, 32 patterns, 548 pack-specific thumbnails.
- The most recent product change is Video Hero at `d0fee8ac`: proper muted looping cover, overlay copy, explicit Play/Pause, visibility/reduced-motion handling, retry/poster fallback and stale-play protection.
- Its saved evidence includes 305 renderer cases and four browser cases passing, native author/save/reopen/recover/publish, actual Website playback and cleanup. See `ConvexPress-Admin/audits/2026-09-04/hero-video-20260921.md` and `output/hero-video-20260921/`.
- No product implementation was performed after that commit during the cost accounting, plan creation or interrupted first continuation. The continuation only read files and checked tooling.
- Original all-app audit remains 8 accepted /16 open, but is now a DEFERRED register except for findings that directly block this scoped delivery. Do not resume its entire payment/refund/domain/installer/backup/fleet campaign.

## Immediate next action

Begin Task 1 in the focused guide. Refresh the tracker read-only, reuse existing acceptance and verify current native editor behavior before assuming old failures still exist. Work through a coherent family batch rather than repeating a full infrastructure cycle for each block.

Opening/navigation family was the next intended batch:

- Announcement Bar: source review found that reversed/equal schedule dates are accepted until rendering and can throw there. New authoring should reject them while old drafts stay readable/recoverable. Use existing shared validation architecture rather than a handwritten block-specific registry.
- Announcement Bar: after dismissal, changing `dismissible` to false can leave the content hidden with no restore control. Reproduce and test the state transition.
- Breadcrumbs: automatic current-page trail has previous native evidence; manual trail and ancestor variants need verification, including hidden parents, actual links/current state and narrow layouts.
- These are reviewed findings/gaps, not newly passing regressions. No patch was made.

Relevant source: `blocks/core/{announcement-bar,breadcrumbs}/`; Website `src/templates/sdk/block-renderer/{announcement.tsx,navigation.css,utilities-dom.cases.jsx,navigation.cases.jsx}`; `scripts/blocks/spec-runtime.mjs` and its tests; backend `convex/canonicalDocuments/navigation.ts` and registered tests.

## Tooling and environment facts

- Admin is a native Electron application. Never run the admin as a browser client for acceptance.
- Preserve the user's processes and open sessions. Discover current executable/path/port/backend identity without printing complete process arguments, which can contain secrets.
- Old process IDs and tool handles in evidence are historical. Revalidate before use.
- The Node REPL was checked at the last continuation: `hfPw`, `hfRoot`, `hfCredentials`, `hfEnv` were all undefined. Reinitialize tooling; do not assume bindings survived.
- Existing acceptance helpers and private credential-loading patterns are in `output/hero-video-20260921/`. Credentials themselves stay outside source/logs/screenshots/arguments. Read the applicable skill and current helper code before adapting it.
- Latest accepted installed backend checkpoint: `ConvexPress-Admin/output/production-checkpoints/hero-video-20260921`; manifest/evidence under `output/hero-video-20260921/`. It retained 1,601 files and 22 installed Events files. Verify current identity/hashes before reuse.
- Derive deployments from the installed checkpoint and overlay reviewed source changes. A prior generic-backend deployment removed an installed plugin's handlers/indexes and required repair. Do not repeat that incident.
- All owned Video Hero fixtures/processes were cleaned. Its original baseline of 42 pages, 11 media records and appearance/plugin data was preserved. Do not assume these are today's total counts without a fresh read.
- Historical Aster cloud quota restrictions and missing AI provider configuration require current checks. Prefer configured CLI/API tools before asking the owner to log in. Keep external missing evidence explicit and continue independent work.

## Tracking and efficient acceptance

MagicTables standalone base: `p5771rm40m4pjw4q4t4x9kdbb18dnm0b`; Blocks table: `q97ft31dnn52vbeha9fdd3zfg98dv4sq`; CLI account `master`. Read the MagicTables skill, inspect current schema/rows, preserve Notes, dry-run exact upserts by Name and verify the full readback. No schema changes or invented Verified flags.

Use one authored page containing several related blocks for shared native save/reopen/recovery/publication, while inspecting every block's actual fields and distinct interactions. Share deployments, builds and cleanup at batch level. Reuse unaffected accepted evidence with source provenance. Backend deployment is unnecessary for a CSS-only renderer change. Refresh only affected thumbnails. Run broad integrated checks at the candidate gate, not after every trivial edit.

At each finished batch and at least each hour of substantive work, report deliverables closed, evidence, remaining requirements, blockers and goal time/token delta. Avoid unrestricted silent execution for days. No arbitrary cap should force an incomplete causal fix, but a long investigation needs a clear required workflow and exit check. Report uncertainty rather than giving an invented completion date.

No subagents unless the owner explicitly requests them or applicable higher-priority instructions require them. Keep logs on disk and return short summaries. No push. No unapproved real charges or outbound messages. The owner wants the system finished and empowered blocker repair, not another sprawling audit.

## Completion

Use the final checklist in the focused guide. Do not mark the goal complete while any required block/editor/template/Customizer/migration/site/demo/SDK/AI workflow or direct blocker remains unresolved. Leave unrelated broader-app findings documented without allowing them to consume this delivery again.
