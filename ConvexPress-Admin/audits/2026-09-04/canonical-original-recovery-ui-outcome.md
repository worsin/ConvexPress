# Original editor recovery and article rhythm

2026-09-05. Source checkpoint; root owns all live/native/provider/browser acceptance.

## Native recovery

The revision list consumes the authoritative optional action discriminator. recover-legacy is presented as an explicit original-editor restore review; it explains that saved authored content will return, current publication/URL/access policy remains unchanged, current canonical content is preserved in history, and unsaved edits will be discarded. The actual generated recoverLegacy mutation receives only current revision and selected revision ID. Its closed receipt must match current document/revision and the subsequent authorized get must match the full authoringDigest before the UI switches back to the original editor.

The original-editor branch now retains revision history, including for non-draft statuses. A canonical safety revision can be restored through the existing restore API with exact current legacy authoringDigest and revision. The normal canonical receipt and fresh full-tree digest are checked before opening the block editor. No data or authoring fields are reconstructed in the client. A denied or mismatched result cannot trigger the editor switch; scope replacement/unmount prevents late completion effects. Actual native client authority remains with SiteRuntimeProvider; no new token or privileges are created.

An actual DOM test caught a callback bug: successful format change deliberately unmounted the old history during fresh read, so testing that history's mount flag again incorrectly suppressed the original-editor switch. The final code relies on the workspace refresh's current-environment guard after the initial mutation-lifetime check.

Gates:5 actual native DOM cases/61 assertions in /tmp/canonical-recovery-ui-tests.log; Admin types /tmp/canonical-recovery-admin-finaltypes.log exit0. Coverage includes explicit review/no early write, wrong-document receipt, full source digest, canonical safety undo, and late completion after environment replacement. Backend behavior/tests belong to auth's checkpoint. Native runtime acceptance remains root work.

## Article paragraph rhythm

Root's real Care preview preserved all three paragraphs and bold marks but applied roughly160px gaps between short paragraphs. The dispatcher wrapped every root paragraph in a Section using marketing-section padding. The fix is an internal renderer prose-flow default for core/paragraph. It uses zero Section padding and a1em sibling article gap; explicit layout.spacing bypasses that default. Existing Stack/Grid/Split gaps remain authoritative rather than being added to paragraph margins. Section/container defaults, nested gutter rules, pack tokens and reveal behavior are unchanged. No authored text, storage, schema or migration metadata changed.

Actual renderer test first failed on the missing prose-flow treatment, then passed with preserved marked text and explicit spacious/default container spacing. Full renderer suite77 tests/1824 assertions, including every current example across4packs, passes /tmp/canonical-prose-flow-alltests.log. Its newsletter real-handler mock was repaired to match the current table-qualified db.patch(table,id,value) signature, asserting the exact newsletter table; runtime newsletter behavior was not changed. Website/demo types pass; portable16 freshness and scoped diff-check pass.

Internal Article rhythm study uses three explicit demonstration paragraphs through the real production renderer and discovered pack primitives. Parent browser gate: Website/apps/web, bunx playwright test --config playwright.block-demo.config.ts block-demo/browser/article-flow.pw.ts --output ../../../output/block-demo/browser-results-article-flow. It verifies positive geometry, no overflow, zero paragraph Section padding, bounded normal article gaps, bold text and8pack/width captures. Actual browser geometry and final full hosting build are pending at this recording. No external/provider calls or browser actions were performed here.

Full hosting build now passes exit0, including all4pack public home/page/post and actual404negative cases, neutral preview and legacy publisher compatibility. Log /tmp/convexpress-canonical-prose-flow-build.log. Sealed receipt output/aster-house/canonical-preview/website-prose-flow-build-receipt.json; Worker4387660bytes SHA256 89f0d9709984ebba06d3a131f1e36489d34b781cbd6677cba4bc5f9532b9f8d8;139assets. Dist held for root publication. Browser geometry still belongs to root acceptance.

## Root live and visual acceptance

Root's article-flow browser gate passed all8pack/width captures; Aster390 and Journal1440 were personally inspected. Actual native Care recovery restored18original authored fields exactly, then canonical safety undo restored v2revision3 with the exact original tree/digest and bold marks. Root published the prose-flow bundle through release nx7d129… (artifact5f83…; full identifiers belong to root receipt). The real Care Website iframe then showed16px paragraph gaps at28.8px line height, preserving all text/bold. These are observed root results, not inferred from source tests. Holds released;83renderer count unchanged.
