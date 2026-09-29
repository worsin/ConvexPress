# Text and download acceptance — September 29

Rich Text Section, Custom HTML and File Download complete their block-specific acceptance. Exact tracker readback is recorded in `output/text-download-20260929/mt-accept-after.json`; the three-row update brings the count to **88 Verified /49 In progress /137**. Full delivery remains active, including Task4 legacy conversion/retirement. Evidence is under `output/text-download-20260929/`.

## E45: actual storage download navigated instead

Before repair, clicking the original Field Notebook card navigated away to the configured backend's public storage URL. No browser download event occurred. The response was text/plain with no attachment disposition; the cross-origin HTML download attribute did not force a download. The selected original was 308 bytes, SHA256 `0612f8d81d3226cbede18e7ae4dd28257dfc7bd2e0f0c874e187bf5b1ee673d2`.

The Website now exposes a same-origin attachment route for an opaque public storage URL key. Its upstream is fixed to the server's configured Convex origin. It forwards no cookies or authorization, follows no redirects, streams the body without whole-file buffering, supports HEAD/single ranges, uses a safe bounded UTF8 filename, and serves octet-stream with attachment/nosniff/no-store headers. Upstream errors are replaced by a generic failure body. The SDK context rewrites only exact public storage paths from the matching configured backend. The Website root supplies that context for published pages and actual Website draft previews. The default standalone SDK/BlockDemo behavior remains intact.

This route does not look up or grant access to private media, does not substitute for Commerce/Lead Magnet capability delivery, and does not revoke existing public storage URLs. Its scope is owned uploaded media from the configured backend. Other-origin or signed/query-bearing legacy media URLs keep their original provider semantics; forced downloads from arbitrary third-party hosts are not claimed. Normal media creation requires an uploaded storage record.

After repair, the real built Website generates a browser download with the original filename and exact 308 bytes while preserving the page URL. All eight normal and eight long-content pack/viewport cases exercise keyboard-triggered attachment downloads and compare bytes. Two independently uploaded disposable text records were trashed and permanently deleted; unavailable-media saves were refused without document changes. The actual public URL key of the second deleted fixture returns404 through the attachment route. The first route probe mistakenly supplied the internal storage ID, received the upstream InvalidStoragePath error mapped to502, and was corrected at the fixture layer; it was not reported as a product regression.

## E46: allowed HTML lost visible structure

Visual inspection of the real mobile page found no unordered-list markers or indentation and a heading the same size as body text. Computed styles proved list-style none, padding0 and h3/body both16px. The scoped Custom HTML rules now restore heading hierarchy, block spacing, unordered/ordered list markers, nested indentation, blockquote and definition-list structure, and actual-link styling using existing template font/color tokens. Sanitization is unchanged. The final probe reads disc,24px indentation,h3 24px versus body16px. All four packs pass normal and long/nested-content containment at1440/390. Representative native and public screenshots were visually inspected.

## Native authoring and exact recovery

Owned real Electron45563 edited eyebrow/heading and all five rich-text marks (bold, italic, strike, underline, code), a hard break and a link across two paragraphs. A javascript link disabled Save. Custom HTML contained allowed headings/paragraphs/emphasis/lists/links alongside script, style, an event handler, an inline style and a javascript URL. The actual Website iframe removed active content and unsafe attributes, retained the safe structure, and never executed the marker script. File selection switched through the native media picker to an alternate original text file and back to the original guide; title and description were edited.

Native save produced block revision3. Reload preserved all edits. History entry4 was independently compared to the exact saved title/tree, then restored after a deliberate title change as block revision5. All six blocks and title compare exactly. The native preview resolves the new attachment path and final HTML list style. History title updates asynchronously; the final assertion waits for the original title. Live editing preview captures selection clicks, so actual download/anchor actions were proved on the published Website rather than falsely attributed to its selection frame.

The installed backend refused six invalid writes: unsafe rich-text link, unsupported heading node in the paragraph-only richtext field, oversized rich copy, oversized raw HTML, and oversized download title/description. Each left the entire document unchanged. This explicitly preserves the boundary for Task4: unsupported legacy structure must be converted losslessly or retained for recovery; this batch does not certify a flattening migration.

## Verification and cleanup

Final normal matrix: four packs at1440/390, all marks/breaks/paragraphs, sanitized structure, keyboard anchor links, exact attachment downloads and empty states. Long matrix: max rich-text eyebrow80/heading120/body2000, long pre/table/blockquote and nested ordered/unordered/definition markup, filename fallback, max download title160/description1000, no page overflow, and exact downloads. No page/console/hydration errors in final matrices.

Fresh checks:15 download tests/188 assertions including existing protected delivery;313 renderer tests/5455 assertions including host-context and standalone behavior; Website types and production build. No backend deployment, stored schema change or dependency installation occurred. The sealed plugin-content backend remains installed. Owned Website47001 runs the final build on4322.

The owned page was permanently deleted and returns404. Both newly uploaded media records and their storage objects were permanently deleted through normal APIs. All42 original pages,11 original media records and appearance values compare exactly; consumer index remains ready. API session revoked and private session file removed. Electron signed out,45563 closed, disposable profile removed. Owner processes39198/62672/65092/68390 were preserved.

Tracker mutation changes only Status, Tests and Screenshots for these three rows after fresh schema/full137-row reads and a verified dry run. Complete readback checks every other cell and every Note. E18/E22/E28, external embeds, Customizer, complete example sites and remaining SDK/AI integration remain open.
