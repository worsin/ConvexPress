# Opus Deep Audit 32 — Template System, Block Editor, and Astra's changes since Sep 28
**Auditor:** Claude Opus · **Written:** 2026-10-05 (this is the complete version; two earlier write attempts were interrupted)
**Scope:**
- Template system: packs, SDK, Customizer, and settings → CSS.
- Block editor: canonical documents, drafts, the public read path, renderers, embeds and composition.
- Astra's 52 commits `9824d960..56d52b9a`: 51 through 2026-09-29, plus today's `56d52b9a`.

**Live source:** hardening worktree `codex/convexpress-hardening` @ `56d52b9a`. Today's commit changed only docs and the status file, no product source.
**Method:** read-only source review. I ran no builds, tests, deploys, Convex commands or pushes, made no product edits, and started or touched no app processes. I also used `npm view` for publish dates, a read-only `mt` tracker pull, `ps`/`lsof` observation, and one local Node evaluation of an installed library function in my scratch directory.

**Labels:**
- **Defect:** the mechanism is traced in current source.
- **Design:** an owner or Codex decision.
- **Observation:** low severity.

Attribution comes from git history, and each item states whether it overlaps an accepted check.

---

## 1. State

| Check | Result |
|---|---|
| Execution | **Resumed today.** `56d52b9a` at 12:33 MDT closes E68 and E69 on refreshed, isolated runtime |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** Matches the status header |
| Preserved Sep 29 processes | PIDs 80269 and 82875 are not running, matching Astra's note. Nothing listens on 4322/4860/4720 now, which fits the run's cleanup |
| Goal metadata | Still `blocked` from the 2026-09-29 17:13Z `server_overloaded` error (Astra's 18:40 note). Astra's monitor has been updated to pick up this audit |

### E68 / E69 runtime acceptance, checked field by field

| File | Fields confirmed |
|---|---|
| `repeat-pick.json` | 2 iterations; each has `focused: header.logo.showTitle`, `groupOpened: true`, `pickerExited: true` |
| `operator-revoked.json` | `panelRemoved`, `activeClaimRemoved`, `saveHintRemoved` and `deniedNotice` all true; `oldSessionDenied: "UNAUTHORIZED"` |
| `operator-recovered.json` | `sameDocument: true`, draft `#761234`, undo → `""`, redo → `#761234`, `errors: []` |
| `preservation.json` | `appearanceSnapshotExact`, `pagesExact: 43`, `queueExact`, `apiSessionRevoked`, `credentialsRemoved` |
| `build-preservation.json` | `priorFilesUnchanged: 1795`; new output under `output/customizer-runtime-20261005/dist` |

**Audit 27's four-item isolation check:**
- **Separate build output:** yes.
- **Process identity:** yes. I confirmed the old processes are gone.
- **Handoff origin:** the existing allowed origin, `http://127.0.0.1:4322`.
- **Runtime configuration:** "six settings from the retained configuration" comes from Astra's report. I did not verify it independently.

**E68 and E69 are accepted on this evidence.** None of the findings below overlap them.

---

## 2. Defects

| ID | Severity | Attribution | One line |
|---|---|---|---|
| D1 | **High** | pre-existing, `e7f0b1a1` (2026-05-11) | Breadcrumb JSON-LD is not escaped for script context |
| D2 | Low–Medium | pre-existing, `8446895a` (2026-09-04) | The site-title bootstrap script is not escaped |
| D3 | Medium | Astra, `cbdff4cd` (2026-09-28) | One failed renderer chunk blanks the whole document body until a reload |
| D4 | Design | pre-existing, `49c3b9d1` | One stored unsupported embed URL makes the whole document unavailable |
| D5 | Policy | Astra, `c3c15fce` (2026-09-28) | `entities@8.1.0` was locked inside the 30-day quarantine |

### D1 — Breadcrumb JSON-LD is not escaped for script context (High)
- **Location:** `ConvexPress-Website/apps/web/src/components/layout/Breadcrumbs.tsx:77`. It serializes breadcrumb data with plain `JSON.stringify` inside an inline `<script type="application/ld+json">`.
- **Where the labels come from:** `hooks/layout/useBreadcrumbs.ts:36-52`. The label can carry text from the URL, because the hook falls back to the route parameter when the loader returns no title.
- **Every other JSON-LD emitter already uses the escaping helper** `serializeJsonLd` (`lib/seo/jsonld.ts:35-40`):
  - `components/seo/SeoBreadcrumbs.tsx:94`
  - `components/seo/SeoHead.tsx:27`
  - `components/seo/JsonLd.tsx:21`
- **Severity:** XSS-class. The component is on public pages and needs no sign-in.
- **Fix:** `__html: serializeJsonLd(jsonLd)`. Add a regression test asserting that the rendered script contains no raw `<`.
- **Overlap:** none. Astra's forms-resume breadcrumb exclusion (`07facfe8`, `routes/_marketing.tsx:80-81`) is adjacent but does not touch serialization.

### D2 — The site-title bootstrap script is not escaped (Low–Medium)
- **Location:** `routes/__root.tsx:205` builds `window.__CONVEXPRESS_SITE_NAME__=${JSON.stringify(resolveSiteName())}` with no escaping. The script directly above it (`:201`, via `lib/site-runtime.ts:115`) already escapes `<`.
- **Input:** `siteTitle` accepts any 1–200 characters (`settings/validation.ts:169-174`).
- **Who can write it:**
  - Anyone with `settings.update_general`. That is administrators by default (`seed/roles.ts:462-476`), and the capability can be granted to custom roles.
  - Content promotion of the `general` fields (`contentPromotion/shared.ts:395`).
- **Why it still matters:** the writer is privileged, but the platform sanitizes admin-authored HTML everywhere else, so this is a gap in that policy.
- **Fix:** apply the same `.replace(/</g, "\\u003c")` used on line 201.

### D3 — One failed renderer chunk blanks the whole document body until a reload (Medium)
- **Failures are cached permanently, by design.** `templates/sdk/block-renderer/lazy-registry.tsx:10-28` keeps a failed load, and `lazy-registry.test.tsx:56-62` asserts a single import attempt. The loader is a module singleton (`block-renderer/discovery.ts:6`).
- **The error replaces the whole body.** It reaches `PublicBoundary` (`block-public/PublicCanonicalBody.tsx:286-297`), which renders "This document is not currently available." for the entire body and has no reset. `block-preview/hydration.ts:21-23` documents this as intended.
- **No chunk-failure handling exists.** There is no `vite:preloadError` handler anywhere in Website source.
- **Scenario:**
  1. Any redeploy changes the hashed chunk names.
  2. A visitor still holding the previous page navigates to a document that uses a block whose chunk has not loaded yet.
  3. The visitor loses the whole body, and every later document using that block also fails until a full reload.

  Fleet deployment across 10+ sites multiplies the exposure.
- **Fix, keeping the no-retry-loop intent:** on a chunk-load failure, do one guarded full reload (`vite:preloadError` plus a `sessionStorage` flag). As well or instead, keep the previous build's assets available for a while after each deploy.
- **Overlap:** none found. I did not re-read `canonical-lazy-renderers-20260928.md`.

### D4 — One stored unsupported embed URL makes the whole document unavailable (Design)
- **Render path:** `block-renderer/consent-embed.tsx:21` calls `reviewedEmbed` during render. It throws `UnsupportedEmbed` (`block-renderer/embed-providers.ts:12-21`). Nothing catches the error, so `PublicBoundary` replaces the body.
- **Why stored data can trigger it:** storage is deliberately permissive. `embedAuthoring.ts` (`ca7cb390`) validates writes only. Two kinds of document can still hold URLs the renderer refuses:
  - documents saved before `ca7cb390`;
  - documents written by paths that skip authoring validation.
- **Search does the same:** `canonicalDocuments/foundation/librarySearch.ts:40-50` mirrors the refusal. That is consistent with E39's recorded "public rendering refuses the document".
- **Recommendation:**
  - When a single block fails a content-validity check, render a block-level "embed unavailable" placeholder.
  - Keep document-level refusal for integrity failures.
  - Align the search projection with that split.

  This is an owner or Codex decision: E39 shows the document-level refusal was a deliberate contract.

### D5 — `entities@8.1.0` was locked inside the 30-day quarantine (Policy)
- **Lock entry:** `ConvexPress-Admin/bun.lock:2418` resolves `sanitize-html/htmlparser2/entities` to `entities@8.1.0`.
  - Published 2026-09-07 22:42Z; locked 2026-09-29 05:09Z, at 21 days old.
  - Still inside the window today. It clears on 2026-10-07 22:42Z.
- **Website differs:** the Website lock resolves the same path to `entities@8.0.0`, published 2026-03-17 (`ConvexPress-Website/bun.lock:1745`).
- **Everything else added with sanitize-html was at least 30 days old when locked:**
  - sanitize-html 2.17.7 (Aug 13)
  - dayjs 1.11.23 (Aug 17)
  - is-plain-object 5.1.0 (Aug 21)
  - the rest, March–May
- **Fix:** pin `entities` to 8.0.0 for this subtree with `overrides` in the Admin root `package.json`, or record an explicit owner exception.

---

## 3. Observations (low)

- **O1 — token routes show the token as the breadcrumb label.** It appears on the page and in the JSON-LD. The routes are `routes/_marketing/track.$token.tsx`, `wishlist.$token.tsx` and `cart/shared/$shareToken.tsx`, and their loaders return no title. The same reasoning as Astra's forms-resume exclusion (`_marketing.tsx:80-81`) applies. Add these routes to `routeOwnsBreadcrumbs`, or give them a generic label.
- **O2 — `appearance.template` write validation differs by writer.**
  - Customizer `publish`/`saveDraft` (`settings/templateDrafts.ts:14-23`) checks the pack slug, module IDs, plain objects and a 250 KB cap.
  - Promotion (`contentPromotion/shared.ts:447-451`) and the generic settings update run only `validateAppearanceTemplate` (`settings/validation.ts:1053-1078`).

  Render-time gating keeps this safe. Move the extra checks into `validateAppearanceTemplate` so every writer applies them.
- **O3 — a scheduled album can stay hidden after its publish time.** `gallery/queries.ts:25` (`isPublicAlbum`) uses `Date.now()` inside a cached query, so the album stays hidden until another change invalidates the query. This fails closed.
- **O4 — two sanitizer engines are in use.** The Website and the Admin backend use sanitize-html behind a DOMPurify-shaped shim (`lib/html-sanitizer.ts`). Admin web `FieldMessage.tsx:1` still imports `isomorphic-dompurify`. Correction to my working notes: the Website's `isomorphic-dompurify ^3.0.0` is not unused, because test fixtures (`*.cases.jsx`) resolve `jsdom` through it.
- **O5 — floating version ranges.** I counted 103 `^`/`~` specs in dependency blocks across 14 `package.json` files, the same at both `9824d960` and `34ba73c0`, so Astra added none. They pre-date Astra's work, but they conflict with the exact-pin rule.

---

## 4. Verified negatives (checked, no finding)

**Template settings and styling**
- Template settings → CSS is gated:
  - `useTemplateSettings.tsx:197-211`.
  - `settingsModules.ts`: FONT regex and `Object.hasOwn` allowlists.
  - `lib/theme/palette.ts:7-9`: the token and colour patterns exclude `<>{};` and newlines.
  - `blockLayout.ts`: closed maps.
  - The style-breakout test is at `settingsModules.test.ts:27`.
- `ThemeStyleInjector.tsx`: font regex, radius map and palette patterns.

**HTML output**
- Every other HTML sink sanitizes its input:
  - CommentItem, FormRenderer, BlockContentRenderer, RestrictedContent, FooterRowsRenderer and ProductParts.
  - The Journal and Aster House footers, and the three pack `system.restricted` surfaces.
  - `safe-html.tsx`.
  - The search excerpt surfaces, which allow a restricted tag list and no attributes.
- `blocks/gallery/recipe-card/render.tsx:26` escapes its JSON-LD. It is the only canonical block that emits raw HTML.

**Document read and draft authority**
- **Public canonical read** (`canonicalDocuments/service.ts:615-657`):
  - gated by `readPublicContent`;
  - the password compare is timing-safe;
  - the restricted state returns only title, path and excerpt;
  - it serves the published composed snapshot.
- **Private canonical drafts** (`canonicalDocuments/drafts.ts`):
  - keyed per post and user;
  - guarded by `authorized()`/`canEditContent`;
  - a generation CAS with idempotent retry;
  - a tombstone on discard.
- **Template drafts** (`settings/templateDrafts.ts`):
  - `manage_options` on all five functions;
  - a revision CAS;
  - live confirmation;
  - promotion target checks.

  Hard-deleting on discard is fine, because the Customizer saves drafts only when explicitly asked (`CustomizerPanel.tsx:207-229`); there is no autosave.
- `settingsSchema.ts` is byte-identical in Admin and Website, enforced by `sync-template-packs.mjs:114` and `check-template-packs.mjs:72`.

**Astra's authority and access changes**
- **Forms authority** (`07facfe8`):
  - login-required submits check for an active user;
  - expiry is enforced on resume writes;
  - membership and login are rechecked on resume reads;
  - the TTL anchor is preserved on resumed saves (`extensions/forms/mutations.ts:1375`).
- Gallery destination access (`046ddc0c`) fails closed.
- **Public file route** (`4b708508`, `lib/downloads/public-storage.ts`):
  - serves only the configured origin;
  - no redirects or credentials;
  - forces `application/octet-stream`, attachment disposition and `nosniff`.
- **Membership content preloads** (`4f6580d7`):
  - same index and key semantics as single reads;
  - overflow throws;
  - the cache is populated only after a successful read.
- **Locale promotion** (`05d6b8c9`):
  - `updatedBy` comes from the operator on both apply and restore;
  - the combined final state is validated in the same transaction (`contentPromotion/operations.ts:670, 839`).
- Reindex authority (`search/actions.ts:88-124`, `search/internals.ts:574-585`): the identity is re-derived inside the internal check.

**Composition and embeds**
- **Composition expressions** (`compositionExpressions.ts`):
  - a closed parser;
  - node and depth limits;
  - prototype keys blocked.

  There is no `eval` or `new Function` in templates, canonical documents, the foundation or blocks.
- Embed providers use closed adapters, a reconstructed `src` and a fixed sandbox.

---

## 5. Suggested order

1. **D1:** a one-line change plus a test.
2. **D2:** a one-line change.
3. **D5:** pin the version, or wait until 2026-10-07 and record an owner exception.
4. **D3:** a guarded reload on chunk failure.
5. **D4:** a design decision.
6. **O1–O5.**

## 6. Limits

- This was a static source review; nothing was run against a live app. D1–D4 are traced through current source, and the severities are my judgement.
- `2026-10-05T1300-audit-32-deep-code-audit.md` is an interrupted partial draft of this audit and now only points here.
