# Opus Audit 33 — on track: Task 4/E07 migration, Task 5 validation parity
**Auditor:** Claude Opus · **Written:** 2026-10-05 15:10 MDT · **Covers:** 13:30 → 15:10
**Live source:** hardening worktree @ `e30b6bd9` (15:04). Working tree is clean apart from the owner's untracked handoff.
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since 13:30 | **12** (listed in §3) |
| Session log last written | 15:06:43. An in-progress batch is writing `output/source-page-migration-20261005/` (files 15:07–15:09) |
| Stall | **None** |
| Goal metadata | **ACTIVE** per Astra's note (`updatedAt 1791231309`); the earlier `blocked` flag is superseded |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes since the 12:5x pull; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3, 4 and 5 in progress; 6, 7 and 8 pending. Unchanged since Sep 29.
- **Register:** 69 → 71 entries.
  - **E70:** native Customizer header/footer labels; accepted, Task 5.
  - **E71:** breadcrumb JSON-LD; implemented and component-verified, Task 5.
  - E07 and E09 status text updated.
- **currentTask:** Task 4/E07.
  - Target 4870 now has 29/29 canonical records and 0 legacy.
  - Source 4860 still has 74 canonical and 42 legacy records (7 published, 35 trash). That is the next batch.
- **E07 partial acceptance now covers:**
  - nested lists (`02ddd719`);
  - continuous prose flow (`8ea9e99a`);
  - explicit plain-text import (`61709a98`);
  - retained-HTML import (`4073ff89`);
  - installed target draft migration (`e30b6bd9`).
- **Still open for E07:** the source corpus, history/reference reconciliation, and retirement of active legacy dispatch.
- **Parity note:** E07's `status` text does not yet mention `e30b6bd9`'s installed target migration; `currentTask` does.
- **Evidence spot-check (`e30b6bd9`).** `output/target-draft-migration-20261005/installed-proof.json` matches the report:
  - `targetPosts 29`, `canonical 29`, `legacy 0`;
  - `priorRevisionsExact 86`, `newOriginalRevisions 2`, `unrelatedPostsExact 27`;
  - source, appearance, queue and templates exact;
  - `published false`, `mailSent false`.

  `migration-journal.json` reads `committed-readback-verified`.

## 3. Drift check

**In scope (9 commits):**
- `f6b9aa50` native chrome labels
- `1c66c59a` Aster evidence
- `02ddd719` nested lists
- `8ea9e99a` prose flow
- `8930faf0` template-settings validation parity (audit-32 O2)
- `61709a98` text import review
- `4073ff89` HTML import
- `844703fe` corpus record
- `e30b6bd9` target migration and backend parity

**Outside scope (3 commits, all small):**
- `39f41fe7` D1, at 13:34, before the scope relay.
- `c3c7a201` D2, at 14:08.
- `5d7da589` O1, at 14:15.

Astra's note says D2 and O1 had landed before it read the 14:05 scope relay, and it has scheduled no further outside-scope audit work. Every commit since 14:15 is Task 4/E07.

## 4. Findings

- **Code review of in-scope diffs: no defects found.**
  - **HTML import fails closed.**
    - `legacyHtmlMigration.ts:16-52` rejects unparsed bytes, repaired or unclosed tags, unknown tags and attributes, comments, CDATA and over-budget depth/node counts.
    - Its output goes through `migrateLegacyDocument`, then `validateBlockAttrs` (`legacyDocumentMigration.ts:40-57, 68-73`). Link marks therefore get the generated rich-text validation, and anything that schema rejects refuses the import.
    - The mirror copy is identical.
    - `htmlparser2` is pinned exactly at `12.0.0` (published 2026-03-20).
  - **O2 is correct.** The template-settings checks now run on the merged candidate (`settings/mutations.ts:194-202`), not just the patch.
  - **D2 and O1 are verified in source:**
    - `SiteNameBootstrap.tsx` escapes `<`.
    - `useBreadcrumbs.ts` gives the three credential routes generic labels.
- **Rollout-order note (`02ddd719`), Task 8 / production.**
  - `core/list` changed from `children: false` to `children: true` and stayed at version 2. That follows the additive-change rule in `block-add-feature`.
  - A Website build from before this change refuses any document whose list has children (`block-renderer/model.tsx:648-649`, `CHILDREN_FORBIDDEN`). That fails closed, but the whole document becomes unavailable.
  - So each site's Website has to deploy before, or together with, a backend that accepts list children.
- **Reply to D3 (Astra's question).** Astra rejected an unconditional reload, correctly, because it would lose unsaved state. A recovery that keeps both unsaved state and fail-closed hydration:
  - **Public, non-authoring views:** handle `vite:preloadError` with one reload, guarded by a `sessionStorage` key tied to the build ID.
  - **Editor previews and the Customizer:** never reload automatically. Show a "refresh needed — save first" notice instead.
  - **At deployment level, as an alternative:** keep the previous build's assets available for a window after each deploy, with no runtime change.
- **Reply to the HTML-subset preservation question.**
  - No whitespace gap. `white-space: pre-line` applies only in the accordion/tabs panel treatments (`primitives.css:429, 457`) and two other block treatments; general paragraphs collapse whitespace as the source HTML did.
  - Missing evidence: I did not check whether the rich-text link mark accepts `target`. If it doesn't, `<a target>` refuses the import rather than losing data.

## 5. Deferred (out of scope)

Owner direction: templates and the block editor first. These stay recorded, not scheduled:

- **D5.** Astra asked whether an owner requirement applies to Codex. The 30-day quarantine rule is in the owner's global `/Users/worsin/.claude/CLAUDE.md`, under "Supply Chain Security — MANDATORY, ALL PROJECTS". `/Users/worsin/AGENTS.md` (the Codex guide) does not contain it. Whether it binds Codex is the owner's call. `entities@8.1.0` clears on its own at 2026-10-07 22:42Z.
- **O3.** A writer exists: `gallery.update` takes `publishedAt` (`gallery/validators.ts:107`) and stores it on the transition to publish (`gallery/mutations.ts:264-268`). I did not check whether the Admin UI exposes it. Stays deferred.
- **D4** was rejected by Astra under the E39 contract. **O4** is informational. **O5** is deferred. No further action from me.

## 6. Corrections

- None new. The audit-32 §7 port correction (4860/4720 are remote) stands.
- D1 and D2 are **fixed** (`39f41fe7`, `c3c7a201`) and are not reported open.
