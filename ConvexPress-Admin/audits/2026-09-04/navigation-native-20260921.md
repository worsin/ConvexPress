# September 21 navigation authoring and missing-target repair

## Repaired behavior

A manual Anchor Nav item naming an absent target passed native editor validation. Save was enabled; the server then refused the write and the editor displayed a generic instruction to reload the current revision. The unsaved text survived, but the message did not identify the actual problem.

The editor now uses the shared navigation index to preflight ordinary authored manual targets. It names the missing target, pauses preview/save while invalid, and allows correction without reload. Checking only documents containing manual navigation avoids additional index work for unrelated pages. Reusable and custom-composed targets still require authorized server expansion, so the local check deliberately does not reject those unresolved cases. No saved format, generated contract, resolver, server authorization or backend deployment changed.

One new regression failed before the fix; all six document-default cases pass afterward. Checks cover correction, target removal, empty manual items, immutability and unresolved reusable references. Together with real editor/composed DOM wrappers: eight outer tests pass. Admin types and full web/desktop builds pass; focused lint has no errors and two pre-existing warnings. Root block checks, generated freshness and eight-kit freshness pass. No full backend-suite rerun is claimed for this client-only change.

## Native and public evidence

An owned Electron session created `BlockDemo — Navigation field guide` on isolated staging 4860. Eight blocks: three Headings plus Table of Contents, Anchor Nav, Breadcrumbs, Child Pages and Menu. Native controls edited H2/H3 levels, rich-text heading labels, explicit anchors, TOC title/depth, automatic then manual jump links, child depth and a menu selected from the actual scoped picker. Saved, reopened and published through Electron; exact revision7 readback verifies the eight block names, anchors, manual item, depth and selected menu ID.

Three related pages (public child, private sibling, public grandchild) and one menu were created using normal authorized APIs, not native hierarchy/menu-builder acceptance. Native TOC depth2 excluded H3; restoring3 included it. Before the fix, missing-target Save was enabled and failed with the generic reload message. After the fix, actual native Save disabled with the specific target message; correction persisted successfully. A final reopen repeated invalid-target refusal and reverted to the saved value, correctly returning to All changes saved with no redundant save required. HMR reset selection during an early check; the harness reselected Anchor Nav and restored the accidentally edited heading before final verification.

Actual production Website under Core, Journal, Depot and Aster House at1440/390 passes:

- Correct TOC, manual link, current breadcrumb, menu references and child/grandchild hierarchy.
- Private sibling absent from both menu and child directory.
- Keyboard Enter moves focus to the actual heading and updates aria-current.
- Child link opens its real page; browser Back returns to the guide.
- No document horizontal overflow or captured public page errors.

Selected screenshots inspected: Core desktop, Journal mobile, Depot mobile and Aster House desktop navigation. These are an authored navigation specimen, not the final premium showcase or hardware motion acceptance. The native error screenshot is scrolled below the full message; textual native assertions provide the diagnostic proof.

## Preservation and tracking

Core restored through native activation; exact original template values and environment identity preserved. Four owned pages trashed and owned menu deleted. Original42 pages,2 posts,4 images, plugin settings and155 listeners compare unchanged. Native operator signed out through the normal control and owned API session logged out. Owned Electron/browser/4322 server closed; original Electron/renderer/BlockDemo/tunnel preserved. Cleanup initially expected a nested menu response, then was corrected against the actual flat return contract before deletion.

Six standalone MagicTables Blocks Notes updated after dry run, with all137 records compared afterward and every other cell/completion flag unchanged. Evidence is in `output/navigation-native-20260921/`: native before/after, saved guide, related fixture journal, eight browser cases, screenshots, tests/types/build logs, cleanup and MagicTables receipts.

This continuation is progress: one user-facing editor repair and a previously missing native/live navigation workflow completed. Full manual/ancestor breadcrumb variants, location/private menu combinations, deep/large child directories, reusable/custom target preflight, final design/motion coverage and broader production requirements remain open. Original audit remains five accepted/nineteen open. Do not repeat this accepted basic specimen in place of closing those remaining requirements.
