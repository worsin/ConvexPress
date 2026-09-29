# Social utilities acceptance — September 29

Social Share, Social Links and Local Sample Alert complete their block-specific acceptance. Tracker readback is **79 Verified /58 In progress /137**. Evidence is in `output/social-utilities-20260929/`. The overall editor/template delivery and final integrated artifact gate remain open.

## Demonstrated gaps and changes

E42 closes four concrete gaps. Social Share accepted newly authored unsupported custom URLs that its renderer rejected. A shared `authoringWebUrl` text-field rule now validates nonempty absolute HTTP(S) URLs at authoring/write boundaries, rejecting credentials, whitespace, controls and backslashes. Empty optional values remain supported. Historical values remain readable and recoverable for repair; this is not a migration or general URL rewrite. Generated backend, portable and editor contracts share the rule. Delayed clipboard promises now update feedback only for the current destination and latest request.

Social Links allowed a valid 40-character label to paint beyond a 390px viewport: its 286px link box contained 362px of unwrapped text. The shared Link primitive now wraps long tokens, matching Heading/Text behavior. The canonical specification also describes an icon row, but the renderer displayed only text. It now uses the existing platform artwork alongside the same accessible labels; unknown platforms use the existing generic external-link icon. Missing destinations remain plain text. No source artwork was changed. Four rendered thumbnails were refreshed; all other manifest entries were preserved.

## Source and installed verification

- 28 contract tests /11,410 assertions across three files; 122 backend tests /1,222 assertions across three files; final 312 renderer cases /5,452 assertions. These cover invalid write/preview/publication refusal, unchanged stored state, historical recovery, nested/default/example validation and stale clipboard completion. Backend/Admin/Website types, final Website build, block freshness, kit checks and all 548 thumbnail checks pass.
- Source installed checkpoint `social-utilities-20260929` overlays 15 reviewed generated files on the previous source checkpoint. All 1,623 sealed source files match, 22 installed Events files remain, and all 2,410 function signatures are unchanged. Private full backup preceded deployment. Target and controller were not deployed.
- Actual installed source refused ten invalid save/preview attempts without changing the document and accepted two corrected previews. Publication refusal is covered by the focused backend tests, not claimed as a separate installed invalid-publication exercise.

## Native and actual Website evidence

An owned native Electron session authored seven blocks on one disposable page. It changed headings/body, reordered share networks and profile rows, toggled current/custom URL modes, edited profile labels/destinations, and changed notice variant/action fields. An invalid custom URL displayed its authoring error and disabled Save. Corrected content saved at block revision 3, reopened exactly, and recovered its exact seven-block tree and title through native history at revision 6. The actual Website preview rendered from port 4322. Stable native errors were empty.

The final built Website passes eight action cases and eight maximum/empty cases: Core, Journal, Depot and Aster House at 1440/390. Current and custom share destinations, network order/deduplication, keyboard actions, copy confirmation, denial/selectable manual fallback, destination-change feedback clearing, profile order/fallbacks/decorative icons, internal links, all three notice variants and empty content pass with no overflow or runtime errors. Real share popups were intercepted and fulfilled locally; mail actions were prevented and inspected. Clipboard outcomes were controlled in each browser context. No outbound posts/messages or host clipboard writes occurred.

Eight final page-top screenshots identify the correct pack and heading, avoiding the earlier scrolled sticky-header capture artifact. Representative final mobile normal/maximum views and the known-platform thumbnail were visually inspected. Final icon rendering is proven in the built public Website and BlockDemo; native field/recovery proof preceded that decorative renderer change.

## Provenance, cleanup and remaining boundaries

Local Sample Alert remains an explicitly authored development/kit example registered in the Library and BlockDemo. Source hashes and all 32 current pack starter patterns were checked; none includes it. Task 6's future complete customer starter websites must preserve this exclusion. Existing September 21 action-validation evidence and September 15 full example coverage are reused within their recorded limits. No schema-version migration was introduced by this batch; full retained-content migration remains Task 4.

The owned page was permanently deleted through normal APIs and its route returns 404. All 42 original pages and original appearance values match exactly; consumer index is ready. API session revoked and private session file removed. Native sign-out confirmed, owned Electron 36810 closed and its profile removed. Owner processes 39198/62672/65092/68390 preserved. The batch's current built source Website is process 38795 on 4322; earlier owned Website processes were replaced.

Initial failures remain recorded: three stale contract fixtures were corrected, an oversized 532-character test body was refused and reduced to the declared limit, and browser harness assumptions about query encoding/event observation were replaced by actual intercepted popup navigation. History entry numbers differ from block revisions; the initially selected entry restored its seed correctly, and the intended entry 4 then restored the accepted revision-3 tree exactly. These were harness/fixture corrections, not additional product defects. Root Bun resource limits were handled by focused backend execution. Earlier overflow and icon regressions failed before their repairs.

Tracker acceptance changes only Status, Tests and Screenshots for the three named rows after a fresh 137-row comparison and exact dry run. Full readback preserved every Note and all other cells; the machine receipt confirms79 Verified /58 In progress. This does not accept full platform readiness, provider delivery, E18 integration or unfinished migration/Customizer/SDK work.
