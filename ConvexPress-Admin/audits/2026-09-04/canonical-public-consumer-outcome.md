# Canonical public consumer, migration and publication UI checkpoint

2026-09-05. Source implementation and offline production runtime verified; root owns live publication acceptance. No live calls, deployment, browser or provider actions were performed by this agent.

## Implemented

The existing homepage, page and post routes now consume the authoritative canonical-public-document-v1 envelope through the actual installed Core, Journal, Depot and Aster renderers. Anonymous SSR uses a fresh unauthenticated ConvexHttpClient and never puts member/password results in the shared query cache. The reactive client binds both ready content and restricted teasers to the current server-verified viewer subject, document, installation and fresh client/session generation. Viewer/session/client changes synchronously unmount previous content; policy denial, missing results and query errors clear it. The Clerk Convex provider is keyed by actual user/session/organization lifetime so same-organization account changes cannot retain the previous token callback.

The native editor now exposes immutable migration review using generated fields/outline and server-derived source/candidate hashes; commit sends hashes and revision, never an arbitrary candidate. Unsupported source errors retain their safe actionable paths. Publication uses the real canonicalDocuments.setPublication contract with explicit review/confirmation, current revision, dirty/conflict guards and actual schedule metadata. Successful writes require matching receipts and a fresh authorized get. Missing older-server scheduledAt is shown as unavailable, never invented. No authority or successful provider behavior is fabricated.

Read-only document preview excludes customer support/customizer/notification widgets and customer Clerk loading; Stripe runtime imports use the existing pure entry to avoid eager global frames. Ordinary customer/payment routes retain their behavior. Native preview status now expires along with content even if a subsequent query never settles and uses ordinary reconnect wording.

## Evidence and regression

Root previously accepted the actual Electron five-block authoring path: initialize/save/reopen, full-tree restore revision3→4 with original digest and bold marks, actual scoped media/page references and Aster Website iframe rendering. Root measured content clearing3769ms after offline. Evidence: output/aster-house/canonical-native/acceptance.json and native-live-preview.png. That is live private-editor proof, separate from this public source gate.

The first expanded production gate failed on the blog route: its loader prefetched the post into TanStack Query, while its component read a separate native Convex subscription and rendered an SSR skeleton. The primary route reader now consumes the existing prefetched query. The failed log remains /tmp/convexpress-canonical-public-build1.log. The corrected full build passed: /tmp/convexpress-canonical-public-build2.log.

Final gates:
- Admin and Website TypeScript exit0: /tmp/canonical-publication-admin-final-types.log and /tmp/canonical-public-consumer-types5.log.
- Actual native workspace DOM4 tests49 assertions, including migration and publication confirmation; expiry1 test4 assertions. Logs /tmp/canonical-native-dom-final.log and /tmp/canonical-native-final-tests.log.
- Public DTO/subscription2 tests20 assertions and real component lifetime1 test12 assertions. Logs /tmp/canonical-public-final-tests.log and /tmp/canonical-public-dom-final.log.
- Exact bundled workerd SSR across4 packs × homepage/page/blog preserves marked text and exact1536×1024 referenced image. Neutral top-level preview and old-publisher binding compatibility also pass. Every outbound runtime request is intercepted locally; this is no provider/live claim.
- Portable16 exact authoritative files current. Production renderer import closure83 modules, zero forbidden demo/server/Node imports. Scoped diff-check passes.

Sealed artifact: output/aster-house/canonical-preview/website-public-lifecycle-build-receipt.json. Worker4387171 bytes, SHA256 f5499b7c8dc60cbad7b6de7aab8eefc4d53e4c20658da3445df6821638c75793; manifest886d2feac407bc7da6fd1fbf064e4f470b1660104ed033d69d2fb632e41844fa;139 assets with file sizes checked. Source and dist held for root snapshot/publication.

## Remaining acceptance and scope

Root must deploy the matching backend and publish the held Website, then verify retained draft publication/unpublication, schedules/cancellation, public denied/authorized transitions and migration review/commit/reopen in actual native/Website sessions. Unsaved live preview, richer composition tools, all legacy block migration adapters, final canonical promotion/duplicate compatibility and remaining136 catalog scope remain required; this checkpoint does not redefine them as complete. The media picker double-modal polish requested by root remains outstanding. No final full-catalog flag was changed.

## Root live publication and HTTP-status regression

Root published the prior held public-consumer artifact through actual native release nx74v7ancjsbwk5291tj7mkejn8dvr5r. The retained five-block draft advanced revision4→published5; public SSR/browser body and both1536×1024media were accepted. Private revision6 returned anonymous getForRender:null and omitted authored body from HTML. Root nevertheless found HTTP200 with a rendered404 surface.

The actual workerd gate reproduced that soft404 from the held bundle (/tmp/canonical-route404-red.log). Page and blog loaders now throw TanStack notFound when public metadata is null. They also do so if a v2 canonical policy/body read returns null after metadata was fetched, covering revocation between those two reads. The existing pack-aware marketing notFoundComponent renders the error. Restricted password/member teaser envelopes remain nonnull and do not trigger this absent-document branch. No backend policy or native UI changed.

The runtime gate now requires page/blog HTTP404, complete HTML and absence of authored body/media in both null-metadata and separately revoked-body cases. Website types and scoped diff-check pass. The current rebuild is pending at this recording; source success is not yet claimed as new live status proof.

The corrected full build now passes exit0: /tmp/convexpress-canonical-route404-build.log. Actual workerd verifies all four negative HTTP404 cases plus every existing4pack ×3positive route and neutral preview case. Sealed receipt: output/aster-house/canonical-preview/website-route404-build-receipt.json. Worker SHA256 0d3993fd4d36b32a244693e35917f9445d95ef27ab0b3fb347eb198bbcd114e8; manifest SHA256 ca220aa8e1fcf7bf753d54f496c4567933ad83b818ab90c6a8930cd099c35176;139assets. Dist held for root publication; live HTTP404 remains root acceptance.
