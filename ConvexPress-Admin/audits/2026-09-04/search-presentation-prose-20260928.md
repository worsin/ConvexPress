# Promoted and sanitized HTML search — September 28

E39 remains open; Search Results remains In progress and tracker counts stay **74 Verified /63 In progress /137**. This batch accepts the installed Studio Services promotion and Custom HTML search paths. It does not accept every future promoted composition or the remaining host-dependent Library paths.

## Demonstrated gaps and repair

Registered regressions reproduced missing Studio Services headings/service descriptions after canonical promotion, and missing visible Custom HTML prose. Studio Services has an immutable reviewed primitive composition, but its canonical search descriptor was empty. Custom HTML also had no projection; indexing the raw source would incorrectly include script/style content, attributes and link destinations.

Build discovery now carries the exact reviewed promotion definition into generated metadata alongside its existing digests. Runtime decoding checks the source digest. Candidate traversal reads explicitly text-bearing primitives, authored loops and pack alternatives, omitting data-dependent expressions/loops and nontext props. Current matching uses the selected pack's composition evaluator with authorized resolver/resource data, reference checks, page budgets and the actual child slot. Recursive search-result data stays excluded. An absent optional parent in a hidden candidate alternative is handled without inventing data. The promotion package, its reviewed definition, root specification, renderer source and persisted version are unchanged.

The Website renderer and backend share the same HTML sanitizer and restricted block policy. Search sanitizes first, joins adjacent inline runs, separates block boundaries, decodes sanitizer escapes once and collects only text. Removed script/style/textarea/option content, comments, attributes and destinations do not become prose. The Website's general sanitizer entrypoint re-exports this shared implementation. Its safe tag/attribute/scheme policy remains the same; style parsing is disabled because style attributes are never allowed. Backend adds the exact sanitizer already installed in the Website (`sanitize-html2.17.7`) and its types; the Admin lock records the dependency graph. Portable/deployed closure checks permit that dependency only from the reviewed HTML module. Browser bundling, actual Convex deployment and existing sanitizer tests verify the shared runtime path.

Two generator fixtures replaced their field lists but retained inherited search paths from the earlier authored-text declarations. Their invalid fixture metadata was cleared; production validation was not weakened.

## Verification

- **556 backend tests /4,472 assertions /70 files**, covering search, canonical documents, reusable/custom definitions, conditional Library search, HTML text and installed promotion projection.
- **16 generator/consumer/promotion/closure tests /112 assertions**, including exact portable/deployed source and refusal of undeclared server imports. Exact generated promotion source comparison confirms the immutable definition is retained.
- **310 actual renderer tests /5,442 assertions**, and **4 existing sanitizer tests /20 assertions**, pass. Focused source/HTML/promotion regressions also pass. Backend explicit project typecheck, Admin and Website typechecks, Website production build, canonical and foundation freshness and block-kit synchronization pass.
- Native Electron26980 saved an edited promoted headline, reloaded it, and verified it in the actual Website draft iframe. The same iframe renders the sanitized HTML heading/body, joined inline word and decoded entity; script/style/textarea nodes are absent. Final native errors zero; screenshot inspected.
- **Eight final actual Website cases**, Core/Journal/Depot/Aster House at1440/390, with **56 backend positive/negative decisions**. Promoted service copy and sanitized body copy match; old headline, destinations, attributes and removed content do not. Canonical search keyboard navigation reaches the exact source page, entity text matches, ordinary search finds the joined inline word, no horizontal overflow and no browser/console/hydration errors. Appearance restored exactly. Aster House mobile screenshot inspected.
- The first matrix overlapped my final build, replacing asset files while the preview server held the previous bundle. It failed with resource404s and a Clerk-ready timeout. This is preserved as `public-matrix-build-overlap.json`, not acceptance. After the build completed, the owned preview was restarted and all eight cases reran successfully. A native frame-navigation observation also needed to wait for the attached frame's URL; no product repair or weakened assertion followed. Prior and final native error arrays are both empty.

## Installed source and preservation

Source4860 only; target4870 retained. `search-presentation-20260928` added the projection and dependency, then `search-presentation-final-20260928` installed the optional-parent follow-up. Separate guarded backups include storage; strict deploy typechecks and writer preflight pass. Final deploy55.23seconds. Final snapshot has **1,619 exact source hashes /0 drift**, all22 installed Community Events files retained, and all **2,410 registered function signatures unchanged**. Initial codegen added only the two pure module imports and their members; the manifest records that reviewed change. No consumer endpoint contract changed.

The isolated snapshot carries **25 dependency packages /1,086 hashed files**, including types and their transitive dependencies, matching the current locked package source; final dependency drift zero. Website4322 final ownedPID27512 replaced the prior owned26944 after identity verification.

Both owned pages were removed through normal trash/permanent-delete APIs; both routes return404 and unique owned search terms have zero matches. Original **42 pages /2 posts /1 term**, menus, locations, appearance and prior reindex state match exactly. Consumer index ready; API session revoked. Native session signed out, process closed and owned profile removed. User Electron39198, Admin62672, BlockDemo65092 and SOCKS68390 preserved. No roles or plugin settings changed. Owner handoff remains untracked and untouched. No push.

Evidence: `output/search-presentation-20260928/` and `output/search-presentation-final-20260928/`, including failing/passing regressions, deployment/package/source receipts, exact promotion check, native proof, final matrix, initial interrupted matrix, cleanup and lifecycle.

## Remaining E39 and delivery work

Review remaining demonstrated host/settings, approved embed and poll/current-definition paths and media title/presentation semantics. Do not add every string as candidate prose. The installed Studio Services proof does not establish a new full promotion workflow for arbitrary resolver-bearing source. F1 plugin defaults remain prerequisite to plugin/support acceptance. Then Language Switcher/promotion and F19 destination construction; E17/E22/E28 and all remaining editor, Customizer, authored-sites, migration, SDK and AI delivery tasks remain open. Audit11/F21 stays an advisory completeness lens; no whole-repository error-handler sweep was introduced.

Accounting checkpoint: progress; **147,742 tokens /1,269seconds** since the prior completed checkpoint (**5,789,885 cumulative tokens /38,642seconds**). Goal active; no dollar estimate.
