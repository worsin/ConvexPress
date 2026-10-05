# Opus Audit 32 — deep code audit: Template System, Block Editor, Astra's changes
**Auditor:** Claude Opus 5.5 · **Written:** 2026-10-05 13:00 MDT
**Scope:** whole-project code read focused on the Template System (packs, SDK, Customizer, settings, drafts), the Block Editor (canonical documents, drafts, public read, renderers, composed blocks), and Astra's 52 commits `9824d960..56d52b9a` (51 implementation commits to 2026-09-29 plus today's `56d52b9a`).
**Live source:** hardening worktree `codex/convexpress-hardening` @ `56d52b9a` (2026-10-05 12:33), working tree clean apart from the owner's untracked handoff.
**Method:** read-only. No builds, tests, deploys, Convex commands, pushes or product edits, and no running process touched. Other actions, all read-only: one local Node evaluation of the installed router library with a harmless marker string (D1); `npm view` publish-date lookups (D4); a fresh `mt` tracker read; `ps`/`lsof` checks.

Astra asked for **current reproducible defects** to be kept separate from **missing evidence** and **historical findings**, with exact paths and workflows and any **overlap with accepted checks**. The sections follow that split.

---

## 1. State

| Check | Result |
|---|---|
| Execution | **Resumed today.** `56d52b9a` at 12:33 MDT closes E68 and E69 on refreshed runtime. Astra's turn ended 12:34; goal metadata still reads `blocked` from the 2026-09-29 `server_overloaded` error (CODEX-NOTES, 2026-10-05 entry). |
| Fresh `mt` pull | **137 rows: 117 Verified / 20 In progress.** Matches the status header. |
| Sep-29 preserved processes | PIDs 80269 and 82875 are gone, as Astra reported. Uptime 42 days, so they exited without a reboot. |
| Ports 4322 / 4860 / 4720 | Nothing listening now, consistent with the run's recorded cleanup. |
| Product source changed since `34ba73c0` | **No.** `56d52b9a` touches only the acceptance report and the status file. |

### Today's E68/E69 acceptance — evidence checked against the report

Every claim in `ConvexPress-Admin/audits/2026-09-04/customizer-runtime-20261005.md` matches its receipt in `output/customizer-runtime-20261005/`:

- `repeat-pick.json`: in both iterations `focused: header.logo.showTitle`, `groupOpened: true`, `pickerExited: true`.
- `operator-revoked.json`: `panelRemoved`, `activeClaimRemoved`, `saveHintRemoved`, `deniedNotice` all true; `oldSessionDenied: "UNAUTHORIZED"`.
- `operator-recovered.json`: `sameDocument: true`, draft `#761234`, undo → `""`, redo → `#761234`, `activeNoticeRestored: true`, `errors: []`.
- `preservation.json`: appearance snapshot exact, 43 pages exact, queue exact, API session revoked, credentials removed.

**The four-item isolation check from audit 27 is met:**
- **Separate build output:** `build-preservation.json` shows `priorFilesUnchanged: 1795` and a new `dist` under `output/`.
- **Process identity:** the old 4322 process no longer exists.
- **Retained runtime configuration:** asserted in the report. I did not inspect the six settings.
- **Legitimate handoff origin:** the existing allowed `http://127.0.0.1:4322`.

`output/…/node_modules` is a symlink to the Website's `node_modules`. That is how the report says SSR resolution was solved, and the original `dist` is unaffected.

---

## 2. Current defects (reproducible from the code path)

### D1 — HIGH · reflected script injection through breadcrumb JSON-LD · pre-existing (initial release `e7f0b1a1`, 2026-05-11)

**Path.**
- `ConvexPress-Website/apps/web/src/components/layout/Breadcrumbs.tsx:75-78` emits `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}>`.
- `JSON.stringify` does not escape `<` or `/`.
- Labels come from `hooks/layout/useBreadcrumbs.ts:36-51`. For a dynamic last segment it uses `loaderData.title | name | slug`, otherwise the **route parameter value**, title-cased.
- It renders on every `_marketing` route through `components/layout/ContentWrapper.tsx:31` (`routes/_marketing.tsx:162`). The only exclusions are category/tag and form-resume URLs (`_marketing.tsx:79-81`) and `fullWidth` pages.

**Why a URL reaches it.** In the installed `@tanstack/router-core@1.158.4`:
- `decodePath` uses `decodeURI` (`dist/esm/utils.js:173-187, 209-229`), which leaves `%2F` encoded, so the segment still matches the `$param` route.
- The param is then decoded with `decodeURIComponent` (`new-process-route-tree.js:505`), which turns `%2F` into `/`.

**Workflow.** Request a `_marketing` route whose last segment is a parameter and whose loader returns no `title`/`name`/`slug`. Examples from the tree:
- no loader at all: `/certificates/