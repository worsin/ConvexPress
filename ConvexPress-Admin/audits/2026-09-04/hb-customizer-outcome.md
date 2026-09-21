# HB1 / HB2 / HB4 — on-site Customizer and template chrome

Implemented locally in the hardening worktree. Backend draft concurrency/promotion and Admin Customize integration are documented in the HB3 workstream. No deployment or browser acceptance is claimed here.

## Implemented

- Website admin toolbar opens an on-site panel only for `manage_options`; direct `?customize=1` opens the same authorized UI. Anonymous/customer visitors get no editing or mutation controls.
- The panel supports template preview, searchable groups, complete override drafts, named palettes, brand/group reset, undo/redo, private draft save/load, change review and explicit publish confirmation. Publishing uses the site's authenticated, revision-checked backend mutation. Saved draft revisions are retained locally so another window's updates produce a conflict rather than being silently overwritten.
- Desktop edits update the live page; phone/tablet frames receive the same draft from their exact parent. External preview messages require preview mode and the actual parent window. Missing draft fields restore defaults, including nested builder fields and variants. Template-aware backends no longer emit a second saved palette beneath the draft, which previously prevented color resets from showing.
- Surfaces register their mounted identities; SDK field getters register reads. Groups identify current-page settings using declared surfaces plus recorded reads. “Select a setting on the page” enables a one-shot hover outline/name and click-to-field action, then returns to ordinary page navigation. Header, branding, navigation and footer primitives are stamped with concrete setting targets.
- Header/footer fields derive from the existing builders' definitions and defaults. Website configuration hooks now read active-pack SDK values; per-template menu locations map navigation roles to configured locations. Existing Header/Footer section controls and the full drag-and-drop footer row builder are reused in Admin Customize as controlled draft editors, skipping their independent global queries/saves.
- The on-site footer controls support ordered rows/columns, cell types and fields, image selection, menu columns and cell links. Header/footer standalone screens redirect to Customize and are removed from navigation. The migration workstream preserves global chrome into each active pack with a versioned receipt and normalizes earlier flat field aliases.

## Verified locally

- Website source suite: **479 pass, 0 fail, 1,155 assertions** across 29 files at the HB checkpoint.
- Website lint and TypeScript: **pass**. Admin TypeScript: **pass**.
- Controlled Admin header/footer component SSR tests: **2 pass**, including a footer client that throws if a controlled builder queries or mutates global settings. The test supplies Convex's real `anyApi` proxy because Bun otherwise resolves the Admin's declaration-only API alias.
- Template draft tests cover complete/nested reset, field relevance, exact-parent message trust, history, variant removal, unsafe dotted paths and bounded history. Footer SSR tests verify structured row/cell controls and empty fallback. Palette regression verifies that saved compatibility CSS cannot override reset previews.
- Catalog/mirror check: **3 packs / 86 surfaces pass**. `git diff --check`: **pass**.

## Root browser acceptance sequence

1. On each staging Website, visit `?customize=1` as an anonymous visitor and customer: no panel. Sign in with the site's operator and open Customize from the toolbar.
2. Change a color, font, nested header option and footer row. Observe live DOM changes before saving; use Undo/Redo, group reset and brand reset. Verify a reset removes the old saved color from computed CSS.
3. Navigate between an article, shop and account page with the panel open. Enable “Select a setting on the page”, hover/click branding and navigation, verify the named field receives focus, then confirm menu navigation works normally afterward.
4. Switch phone/tablet preview and verify each draft edit reaches the frame. Switch templates and ensure each retains its own saved header/footer/menu configuration.
5. Save/load a private draft. In a second operator window publish another change; the first panel must show a version conflict and its stale publish must be rejected. Review/confirm a staging publish and verify reload persists it.
6. In Admin Customize, edit a header section, footer menu column and row/cell. Verify no separate global save button appears. Publish the combined draft and check the Website. Visit old Header/Footer URLs and confirm redirects.
7. Use the HB3 promotion workflow for same-website staging-to-live; verify cross-website promotion rejection and explicit live confirmation.
