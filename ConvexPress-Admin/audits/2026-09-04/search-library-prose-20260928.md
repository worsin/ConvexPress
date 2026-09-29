# Library authored-prose search, first coverage pass — September 28

E39 remains open. This pass adds deliberate search-text declarations to 36 canonical Library specifications, makes current search refuse canonical bodies whose selected media prevents public rendering, and removes the empty-category `0` from the ordinary Core search card. Stored fields, versions, defaults, requirements, treatments and examples are unchanged. Search Results remains In progress; tracker counts remain **74 Verified /63 In progress /137**. No external tracker cells were changed.

## Repair and boundary

Registered tests first reproduced missing Contact Form, Hero Video and Countdown authored copy, and a hero phrase returned despite unavailable selected media. Root `block.json` declarations now cover unconditional editorial headings, introductions, visible contact values, captions, badges and code. Prose follows the renderer's formatting semantics: Markdown destinations, private recipient settings, form success messages and unshown expiry alternatives do not enter the corpus. Category Tiles and Product Showcase introductions remain literal text because their renderers use Text. Current form matches disappear when its plugin is disabled.

Current canonical search calls the same resource reader used by public rendering before collecting text. An unavailable selected resource therefore refuses that document's body match. This is not a claim of complete conditional or resource-presentation parity: MIME-dependent rendering, conditional offer/account/media states, custom HTML and promoted canonical compositions still require deliberate coverage. Existing composed definitions retain their current resolver/presentation path and budget guards. No approval or access checks were cached.

The ordinary Core result card used a numeric array length directly as a React conditional, rendering `0` for empty category/tag arrays. Boolean coercion removes that artifact. Other pack result cards have separate renderers and were checked in the live matrix.

## Evidence

- Focused failing-before and passing-after regressions: **21 tests /87 assertions** across two files. Broader search/canonical/reusable/custom-definition suite: **539 tests /4,378 assertions /67 files**, all passing. Actual installed-pack renderer suite: **310 tests /5,442 assertions**, all passing.
- Backend types with the explicit Convex project, Admin types, Website types and Website production build pass. Strict deployment typechecking and writer preflight pass. An initial root invocation had no project; a subsequent parent-project invocation exhausted the default heap. Neither is counted as acceptance. The scoped `convex/tsconfig.json` command with the established 8GiB heap passed.
- Canonical validation and generated freshness pass. Block-kit freshness initially exposed existing Contract distribution drift; syncing its single stale Contract file restored **77 files /0 stale**. No field/version migration was introduced.
- Normal APIs created two disposable published canonical pages: a 22-block authored specimen and a Search Results control. Its first control initialization used the invalid fixture value `queryBinding: location`; the validator rejected it without advancing revision. Inspection confirmed draft/revision0, then a journaled correction used the declared `url` value. No blind replay occurred.
- Owned native Electron **19626**, source4860, edited Image caption, saved, reloaded, and rendered the edited caption in the actual Website draft iframe. Saved input, iframe text and painted screenshot were verified; no native errors occurred before cleanup.
- **88 current backend matches**: each of the 22 sampled block words in each of Core, Journal, Depot and Aster House. **Eight actual Website cases** at1440/390: all22 bodies rendered, new caption matched, old caption did not, canonical result keyboard navigation reached the exact URL and H1, ordinary search linked the correct destination, no standalone `0`, no overflow and no browser/console/hydration errors. All temporary appearance changes were restored exactly.
- Initial browser harness assumptions about trailing slash and Journal's heading level were corrected. Final assertions use the exact destination with optional trailing slash, exact destination H1, exact body anchors, and named result links. Only the final eight-case matrix is acceptance evidence.
- Native painted editor and Core desktop/Aster House mobile ordinary-search screenshots were visually inspected. The 22 live specimens do not constitute full live coverage of all36 changed declarations or acceptance of all137 blocks.

## Installed source and preservation

Source **4860** only; target4870 untouched. Snapshot `ConvexPress-Admin/output/production-checkpoints/search-library-20260928`: **1,611 exact hashes /0 drift**, eight changed backend files, all22 installed Community Events files preserved, all **2,410 registered function signatures unchanged**. Deployment succeeded in56.29seconds with a private backup including storage. Website4322 was rebuilt and restarted as owned PID19604, replacing the previous owned12154 after identity verification. User Electron39198, Admin62672, BlockDemo65092 and SOCKS68390 were retained.

Both owned pages were trashed and permanently deleted through normal APIs; their routes return404 and owned search matches are zero. Original **42 pages /2 posts /1 term**, menus, locations, appearance and prior reindex state match exactly. Consumer index is ready; owned API session revoked. No roles or plugin settings changed. Native sign-out and closure are recorded in the final lifecycle receipt.

`compatibility.json` and `spec-reconciliation.json` establish that all36 specification changes are search metadata only; existing row statuses are preserved. Older renderer/editor evidence remains scoped to its original workflow. Generated catalogs, portable data and deployed foundation are synchronized.

Evidence directory: `output/search-library-20260928/` (red/green and final suite logs, compatibility, public-matrix, native-proof, deployment/hash/signature receipts and cleanup). Owner handoff remains untracked and untouched. No push.

## Next E39 boundary

Complete current conditional editorial copy rather than indexing every string: product collections/manual groups/counts, offer availability, account state, timed announcements/expiry, selected media captions/labels, resolved forms/polls, table-of-contents visibility, promoted canonical composition and sanitized HTML. Keep URLs, identifiers, controls, private configuration and inaccessible alternatives excluded. Reuse existing projection/presentation contracts and establish a failing workflow before changing them. F1 plugin-default parity remains a prerequisite for plugin/support acceptance. Then complete Language Switcher/promotion and assess F19 shared destination construction. E17/E22/E28 and remaining authored-sites/Customizer/migration/SDK/AI tasks stay open.
