# ConvexPress — full project audit, run assessment, and takeover plan
**Auditor:** Claude Opus · **Written:** 2026-10-07 18:20 MDT
**Baseline:** `main` @ `55946526`, identical to GitHub `worsin/ConvexPress` `main`
**Method:**
- Every quality gate was run in the main checkout, one at a time.
- The four example sites were reviewed in a browser at 1440 px and 375 px.
- Git history, the delivery register and the tracker were measured.

---

## 1. Bottom line

**The engineering went well; the product is not yet premium.**

**Astra delivered most of what the plan asked for:**
- 136 of 137 blocks verified.
- One content model; the legacy editor, renderers, schema and themes retired.
- A unified Customizer.
- Four authored example sites.
- Block, template and extension SDKs.
- Your original sites (alpha–delta) migrated with every post and revision preserved.

**What's left of the plan needs three things from you:**
1. Instagram authorization.
2. Restoring the HTTPS staging deployment, which a Convex free-plan quota disabled.
3. Cloudflare access to remove an unused test widget.

**The build is mostly healthy, not fully green:**
- Both apps type-check clean, and about 5,760 of 5,770 tests pass.
- 10 tests fail: 9 in the control plane and 1 in tooling.
- The Website lint gate is red.
- One delivery check can only run inside Astra's private worktree.

The weakest part is **how the sites look**. The four example sites work and render cleanly, but they read as competent wireframes, not premium websites. That is where I'll put my emphasis.

---

## 2. What ConvexPress is today

| Area | Size | Notes |
|---|---|---|
| Admin backend (Convex) | 266k source / 65k test lines | 77 modules: CMS, commerce (subscriptions, returns, digital, bundles, wishlists, reviews), LMS, membership, KB, tickets, forms, events, email, search, SEO, WordPress sync, AI, content promotion, localization, and more |
| Admin web (Electron renderer) | 190k / 13k | Native app with canonical editor and Customizer |
| Website (TanStack Start SSR) | 156k / 20k | 127 routes; 4 template packs (Core, Journal, Depot, Aster House) × ~90 surfaces |
| Canonical blocks | 137 blocks / 35k lines | One JSON spec per block; generated validators, editors, catalog and AI metadata |
| Control plane + desktop | 36k / 14k | Fleet and site management, Electron shell |
| **Total** | **~700k hand-written, 118k test, 91k generated** | 8,081 tracked files |

---

## 3. Health check (run today on `main`)

| Gate | Result |
|---|---|
| Block catalog and contracts (`check:blocks`) | ✅ pass |
| Block tests (`test:blocks`) | ✅ 191 / 0 |
| Generated-source drift (`sync:blocks:all --check`) | ✅ in sync |
| Block kit distribution | ✅ 8 skills, 0 stale |
| Template packs | ✅ 4 packs, 90 surfaces |
| Website type-check | ✅ 0 errors |
| Admin type-check (4 projects) | ✅ 0 errors |
| Website tests | ✅ 729 / 0, after a frozen-lockfile install; see note |
| Admin backend tests | ✅ 3,773 / 0 |
| Admin web tests | ✅ 524 / 0 |
| Desktop / contracts tests | ✅ 118 / 0 · 35 / 0 |
| **Control-plane tests** | ❌ **377 / 9** |
| **Tooling tests** | ❌ **14 / 1** |
| **Website lint** | ❌ 4 warnings against `--max-warnings 0` |
| **`check:delivery-status`** | ❌ reads `output/remaining-acceptance-20261007/mt-after.json`, which exists only in Astra's worktree |

**Notes:**
- **Install drift.** Your main checkout's Admin dependencies predated a dependency Astra added (`htmlparser2`). The frozen-lockfile install fixed it with no version changes. Astra ran its gates in its own worktree, so main was never verified directly. That gap is how the 10 failures below went unnoticed.
- **Browser console.** No console errors on the pages reviewed.

---

## 4. How the Astra run went

**Output (Sep 28 → Oct 7):**
- 219 deliberate commits, 107 of them on Oct 6 alone, plus 232 automatic "auto:" commits.
- The register grew to 117 entries, of which 112 are accepted or repaired.
- The tracker went from 117 to 136 Verified, 19 promoted in the last two days.

**What went well:**
- **Data preservation was exemplary.** Every migration took a full backup first and verified posts, revisions, files, appearance and mail exactly before and after. That includes the original fleet: 11 posts, 11 archives and 120 files byte-identical.
- **Self-correction.** Astra reopened Task 4 twice when it found its own "complete" was premature (schema columns, themes). Bookkeeping slips were fixed within an hour of being flagged.
- **Real defects found by building real things.** The example sites exposed dozens of Customizer settings that some packs silently ignored (E79–E97), and every one was fixed across all four packs.
- **Responsive to audits.** Every finding got an accept, adapt, defer or reject decision within the hour.

**What went poorly:**
- **A six-day stall** (Sep 29 → Oct 5). A model-capacity error left the goal blocked; nothing resumed it until you did.
- **Gates were only green where Astra ran them.** Its final "broad candidate gates" did not include the control-plane suite: 9 promotion tests broke when old-format promotions were fenced on Oct 6 and were never updated.
- **Scope creep in places.** For example, about 1.5 hours inside the AI shopping assistant's cart engine before returning to editor and template work.
- **Process weight.**
  - 423 acceptance reports (4.2 MB), a 394 KB notes file, and a 370 KB status file written in extremely compressed prose.
  - Evidence is thorough but hard for a person to use.
  - Reports cite commit hashes everywhere, which is why today's history rewrite needed a commit map.
- **Visual bar not met.** Requirement 42 ("premium visuals") was accepted on test receipts. The sites themselves (§6) don't meet that bar to my eye.

---

## 5. What's left of the plan

| Item | Owner action needed |
|---|---|
| `core/social-feed` (E98), the last unverified block | Connect a real Instagram account in the app |
| Public HTTPS operator/preview acceptance (E05, E14) | Convex free-plan quota disabled the registered staging deployment: upgrade, or approve another HTTPS staging host (self-hosted Convex fits your local-database rule) |
| Unused Turnstile test widget | Cloudflare access, or remove it yourself |
| Tasks 3, 5, 6, 8 | Stay "in progress" only because of the three items above |

---

## 6. Findings

### Must fix (I'll take these first)

- **F1 — 9 failing control-plane tests.**
  - `packages/control-plane/convex/contentPromotion/__tests__/apply.test.ts` and `mediaTransfer.test.ts` still use old-format documents. The Oct 6 change correctly refuses those (`CANONICAL_SOURCE_MIGRATION_REQUIRED`).
  - Fix: move the fixtures to canonical documents.
- **F2 — 1 failing tooling test.**
  - `scripts/__tests__/create-extension.integration.test.ts:87` expects a generated "search maintenance owns its source table" test, which the scaffold no longer emits.
  - Fix: realign the scaffold and its expectation.
- **F3 — Website lint red.**
  - Two warnings are intentional control-character regexes (`lib/downloads/serve.ts:47`, generated `spec-runtime.mjs:313`).
  - One is an unused parameter in a fixture, and one is a needless spread in a test.
  - Fix: annotate the intentional ones; clean up the others.
- **F4 — Delivery check depends on ignored local files.**
  - `check:delivery-status` can't run on a fresh checkout.
  - Fix: read the tracker live, or commit the snapshot it needs.
- **F5 — No single "verify everything" command.**
  - Fix: add one root script that runs every gate above in sequence. Run it in the main checkout before every push.

### Design quality (my main emphasis)

- **D1 — Heroes waste the first screen.**
  - Core, Journal and Depot open with a large grey card holding a headline and empty space; the image starts below the fold.
  - On a phone, Core's first screen is entirely an empty grey card.
- **D2 — The store's homepage shows no products.**
  - Depot (Common Supply) has text sections and a CTA but no merchandise. The shop page itself is solid: grid, filters, cart panel.
- **D3 — Mobile overlap.** The floating help button covers the "Add to cart" button on the phone shop grid.
- **D4 — The packs feel like one design with different fonts.**
  - Aster House is the strongest: serif, warm palette, full-bleed imagery.
  - Core, Journal and Depot share the same grey-card rhythm.
  - I want each pack to have a distinct, premium point of view.

### Maintainability

- **M1 — Size and type escapes.**
  - 59 hand-written files exceed 1,000 lines; the largest are `CommerceProductEditor.tsx` (3,084) and `emails/internals.ts` (2,470).
  - There are 1,810 `as any`, 4,252 `: any` and 2,806 `@ts-expect-error`. Many of the last are the Convex TS2589 suppressions your rules call for, but the volume deserves steady reduction.
- **M2 — Legacy block layer still present.**
  - `apps/web/src/lib/blocks/` (about 4k lines, including `registry.tsx` at 2,642) and `apps/web/src/blocks/*` remain from the retired editor.
  - They still feed compatibility and catalog checks, so it's a retirement review, not a delete.
- **M3 — Triplicated "portable" foundation code.**
  - The same files live in Website `portable/`, Admin `foundation/`, and `canonical-blocks-foundation/`.
  - Sync checks keep them identical, but every change touches three places.
  - A shared package would remove that.

### Repository hygiene

- **H1 — Clutter.** 25 screenshots at the repo root, `old-files/`, and 280 tracked files inside ignored paths (`output/`, `ConvexPress-Admin/output/`).
- **H2 — Auto-commit noise.** 232 "auto:" commits in 10 days bury the real history. They were also never pushed, which is how GitHub fell 651 commits behind.
- **H3 — Tool checkpoint refs.** 174 `refs/t3/checkpoints/*` refs from another tool sit in the repo.

### Earlier security findings (deep audit 32) — status only

- D1 and D2 are fixed.
- D3 is deferred pending reproduction.
- D4 was rejected by design.
- `entities@8.1.0` cleared the 30-day window today.

---

## 7. Done today: GitHub and branches

- GitHub was 651 commits behind (last push Sep 2), and a 122.7 MB Playwright zip blocked any push.
- **Backup taken first:**
  - a full bundle, `~/Development/ConvexPress-backups/convexpress-all-refs-2026-10-07.bundle` (196 refs, verified);
  - the local tag `backup/pre-history-cleanup-20261007`.
- **Rewrite:** only `output/playwright/*.zip` was removed from the unpushed commits, in a scratch clone. The tree is identical apart from the zips, and no file over 50 MB remains.
- **Push:** a clean fast-forward. GitHub `main` now equals local `main`.
- **History map:** old → new hashes are in `docs/history/2026-10-07-commit-map.tsv` (see `docs/history/2026-10-07-history-cleanup.md`).
- **Branches:**
  - Deleted the merged `ConvexPress-Overhaul` (GitHub) and `codex/fix-electron-setup-wizard-login` (local).
  - GitHub now has one branch, `main`.
  - Astra's worktree branch remains; its folder holds Astra's untracked acceptance receipts.
- **Zips:** still on disk, now untracked (`output/` is ignored).

---

## 8. Takeover plan — how I'll run it

**Working rules:**
- `main` is the single source of truth. Short-lived branches only when a change is risky.
- **Every batch ends green in the main checkout and pushed to GitHub.** No more silent drift.
- One living `STATUS.md` replaces the stream of acceptance reports. Evidence stays, prose gets plain.
- Data safety stays exactly as strict as Astra's: backup first, verify before and after.

**Phase 0 — Stabilize (first session):** F1–F5. Every gate green, one `verify` command, pushed.

**Phase 1 — Make it look premium:**
- A design pass on the four packs and example sites: D1–D4.
- Imagery-led heroes, products on the store home, a distinct identity per pack.
- Fix the mobile overlap.
- Checked in the browser at desktop and phone widths, every screen.

**Phase 2 — Simplify:**
- Retire the legacy block layer (M2).
- One shared foundation package (M3).
- Break up the 3k-line files (M1).
- Repo hygiene (H1–H3); anything that deletes files comes to you first.

**Phase 3 — Close the external gates** once you provide the three items in §5.

**Phase 4 — Fleet production readiness:** a repeatable deploy to all sites with the same backup-and-verify discipline, plus monitoring.

**Before I start, from you:**
1. **Stop Astra.** Its hourly audit automation is still running, and two agents in one repo will collide.
2. **The three external items in §5**, whenever you're ready. Nothing else waits on them.
