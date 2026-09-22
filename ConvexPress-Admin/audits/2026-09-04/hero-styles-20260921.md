# Hero named treatments — September 21

**Main Hero is verified for its current canonical contract, including the required default/editorial/poster styles. 57/137 blocks verified;80 In progress. Original production audit remains eight accepted/sixteen open.** Whole-template websites, other blocks and release acceptance remain open.

## Implementation

Each of Core, Journal, Depot and Aster House declares its own Hero renderer and finite style list. Editorial uses a ruled asymmetric title/copy and portrait-image layout. Poster uses a large headline over an image/summary spread. Shared SDK composition mechanics preserve the same typed attrs, safe actions, resolved media and template primitives. Pack-owned CSS sets finite typography/spacing/image treatments; no authored CSS or cross-pack imports are introduced. Journal is spacious and italic, Depot compact, Aster uses sharp corners and taller photography, and Core stays neutral.

Core/Aster default rendering reuses the shared HeroDefault SDK component. The canonical Library renderer delegates to that same component, preserving the prior DOM, stylesheet and default behavior. Initial direct imports of the root Library renderer from pack files passed bundling but failed Website TypeScript's React boundary; moving the common rendering into the SDK resolved that failure. Journal/Depot default treatments are unchanged. No attrs, persisted version, references or resolver contracts changed.

BlockDemo now derives a named-style selector from generated metadata. Selection is local, retains the authored style across pack switches, and uses the destination default if unavailable. Changing style resets its optional field-editing specimen, as documented. It has no persistence or provider credentials.

## Acceptance

-Four final browser cases cover the three Hero variants and the new style matrix. Editorial/Poster preserve all authored copy and keyboard link order under every pack at1200/350px. Maximum title length and media removal pass at320px; empty content introduces no fabricated heading, image or action. Actual screenshots reviewed include Journal Poster, Aster Editorial, Core Poster, Depot mobile and the published Website.
-Owned Electron94590 connected to isolated staging4860. Both named choices appeared in the actual editor. Authored title, eyebrow, multiline body, two actions, anchor and original ceramics media were saved as Editorial revision3. Reload retained Editorial; Poster saved/reopened; reviewed history restoration returned to Editorial with the exact revision3 tree.
-Native publication produced Editorial revision7. Saving Poster produced published revision8, with only the style changed in the block tree. Both rendered on the actual built Website at1440/390px. Original image and alt loaded; no horizontal overflow; Poster keyboard focus followed primary to secondary action. Reduced-motion mode kept the title visible and had zero running Hero animations. These static treatments introduce no new animation or gradients; this is not a new full-site motion certification.
-Withdrawal, original-editor restoration and native sign-out passed. Removed fixture g1808t5k718bjw2t8sxavs20xx8exe7a returns a rendered404. All42 original pages and appearance values compare unchanged. Nine plugin/media tables match the pre-deployment backup. API session logged out; owned browser/Electron/preview/tunnel closed and private profile removed. User processes39198/69634/8172/68390 preserved.

The prior Hero-family validation, base-treatment, layout, action and historical recovery evidence remains applicable; see hero-family-20260921.md. Its earlier deployment-transition selected-field timeout remains a runtime follow-up, not erased by this successful stable recovery.

## Checks and deployment

304 renderer cases/5,351 assertions, six presentation/design/composition cases, four final browser cases, Admin/Website/BlockDemo types, client/SSR build, block checks, generated freshness, kit parity,548-thumbnail validation, focused lint and diff whitespace checks pass. The renderer regression also checks each pack's named choices, one heading, unchanged source attrs and unknown-style fallback.

Strict staging deployment succeeded in51.17seconds from ConvexPress-Admin/output/production-checkpoints/hero-styles-20260921, retaining1601 files and22 installed Events files. Manifest and receipt: output/hero-styles-20260921/deployment-source-final.json and deployment-final.json. Future snapshots must derive from this checkpoint. The subsequent shared-renderer move changed Website/root rendering only; deployed generated backend artifacts match current source apart from expected installed-plugin generated indexes/API.

Automation setup mistakes were corrected without weakening assertions: resolving Electron from the wrong package, and invoking one document-read helper from the Website cwd. Neither changed application data. The Website TypeScript import failure above was an actual source boundary issue and was repaired before final acceptance.

MagicTables updates Main Hero's Status/Tests/Screenshots and appends evidence; the other136 rows are preserved by exact full readback. Artifacts: output/hero-styles-20260921, including native-styles.json, editorial.json, restored.json, published-editorial.json, published-poster.json, public-proof.json, reduced-motion.json, final-preservation.json, cleanup.json and public-cleanup.json.

Next: remaining opening, site, discovery, form, plugin and commerce families, followed by complete example-template and release acceptance. Overall goal remains active.
