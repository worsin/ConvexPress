# Long Paragraph authoring and migration — September21

The canonical Paragraph body limit is widened from2,000 to20,000 text characters. Existing v2 values and their semantics are unchanged; no saved version increment or content rewrite occurs. The full tree remains bounded to80 nodes,8 levels and512KiB, and rich text retains its inline-node and safe-link limits. Legacy block-v1 schemas are not silently widened. Original TipTap and structured article source can now convert longer paragraphs without splitting them or dropping marks, breaks, links or empty paragraphs.

## Verification

Three adjacent Paragraph contract regressions failed before the change and now pass: exact marked prose migration, structured paragraph/link preservation, Unicode at20k, over-limit refusal and unsafe-link refusal.25 converter/contract cases pass (1188 assertions).90 registered document-service cases pass (881 assertions), including new rich-text and structured migration/save/reopen/recovery cases.290 renderer cases pass (5011 assertions), including full long literal text, escaped markup and safe link semantics.

Two real-browser cases each exercise Core/Journal/Depot/Aster House at1440/390 widths. The real generated form accepts long copy; one paragraph, bold text, link destination/new-tab safety and keyboard focus survive. Six-thousand-character unbroken text wraps without overflow. Invalid20,001-character input remains editable and preserves the last valid preview; correction recovers. Eight screenshots captured; Journal desktop and Depot mobile inspected. These local previews have no persistence and are distinct from the native test below.

Admin, Website, backend and BlockDemo types pass; Admin and Website production builds pass. Canonical sync/check and thumbnails check pass. Focused lint and diff whitespace pass.

## Actual native / published Website

Strict deployed source4860 uses the previous verified SDK/plugin checkpoint with only changed canonical generated files overlaid. Private pre-operation export includes storage. No provider deployment, DNS or external messaging was performed.

Owned Electron99939, worktree desktop with isolated profile and renderer4105, visibly selected Promotion Lab staging4860. A disposable original rich-text page contained3810 italic characters, a hard break, an external link and an empty paragraph. Native review exposed the full text; conversion kept two paragraph blocks. Native editing added47 characters, saved at revision2 and reopened with3857. Native publication made the actual built Website4322 page public; anonymous Chromium verified full italic text, both paragraphs, exact link and keyboard focus at1440/390, with no overflow or page errors. Both public screenshots inspected.

Native withdrawal returned the fixture to draft; native original-editor recovery completed at revision5. Backend readback compared all original returned fields except expected revision/update metadata; the original JSON, marks and layout were retained. An attempted contenteditable locator was wrong for the Original Text compatibility editor, which uses labelled textareas. The owned window had closed; a second owned window2347 reopened the exact same profile and verified Text1=3810 original characters and Text2=the original link label. It signed out normally. No claim of rich-text WYSIWYG recovery is made from that textarea check; exact structure is proven by stored readback.

All42 original pages and the complete appearance snapshot compared equal. Fixture trashed, API session logged out (200), native session signed out, owned profile/browser/Website/tunnel/BlockDemo processes removed. Original Electron39198, renderer69634, BlockDemo8172 and SOCKS68390 preserved.

## Remaining scope

This closes Paragraph's former2k migration/authoring limit. It does not close all137 blocks, all native template surfaces, other unsupported rich-text/structured structures, mixed-tree capacity or fleet migration/retirement. The20k paragraph bound and whole-document budgets still apply. Original audit remains8accepted/16open.

## Tracker and source closeout

Fresh standalone MagicTables schema and all137rows were checked before the dry-run and apply. Exactly Paragraph Notes/Tests/Screenshots changed; all137rows were read back with Status and other values unchanged. Root canonical check, all generated-source freshness, distributed kit freshness and whitespace checks pass at closeout.
