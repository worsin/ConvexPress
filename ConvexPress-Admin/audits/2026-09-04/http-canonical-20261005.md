# HTTP canonical authoring — October 5, 2026

HTTP post/page create, read and update now use the canonical document model. The existing endpoints remain available; PUT requires `expected_revision`, and GET returns versioned blocks and their revision. Supported legacy input is deliberately converted before commit. API-key authority is rechecked inside the transaction against its environment, expiry, revocation, active site owner and current capabilities. No native or management session is fabricated.

Page hierarchy, reserved routes, publication authority, resource/presentation validation, canonical history, media references and events remain enforced. Accepted metadata changes participate in revision conflict protection. Unkeyed internal single-document reads were removed. Public projection and editable draft reads have explicit DTO validators. Migration instructions are in `docs/api/canonical-content.md`.

## Evidence

- Working tree: 168 focused tests, 1,666 assertions, zero failures. Preserved source snapshot: 162 tests / 1,634 assertions; final target: 132 / 1,136. These are differing installed snapshots, not a repository-wide test claim.
- API tests cover post/page conversion, reads, canonical updates, stale rollback, publication, invalid inputs, revoked/wrong-scope/wrong-environment authority, ownership, hierarchy moves/cycles, real HTTP Request/Response handlers and exactly one update event. Invalid CTA creation must return a structured canonical validation error and leave no row.
- Backend and Admin type checks, generated site contracts and media/consumer writer coverage passed. Final source/target deployments run schema/type checks; no function was removed. Initial rollout changed six HTTP internal signatures per site, explicit GET DTO rollout changed two, final target error correction changed none.
- Real HTTP on both isolated sites: create a parent page, post and nested page; read revision 1; update body/excerpt to revision 2; stale PUT returns 409; missing revision returns 428; subsequent read is exact.
- Four native Electron flows (post/page on each site): open the API-created document, edit title/body, Save, reload, recover exact values. Actual Website draft iframe at 335px retains heading, bold prose and link with no preview overflow. API GET then returns revision 3 with exact native-authored blocks. No captured native console/page errors. Screenshot `output/http-canonical-20261005/target-page-website-mobile.png` was visually reviewed. A later expired preview capture was refreshed before retaining the accepted screenshot; no bypass of preview authority was used.
- Live invalid CTA requests finally return HTTP 400 / INVALID_CANONICAL_DOCUMENT on both sites, with unchanged document-ID sets. Initial target returned 500 while still rolling back. Its old boundary required `instanceof Error`, which its generated Zod error did not satisfy. A failing-before structured-error test reproduced this; backported the existing source boundary, then all target tests and the live refusal passed.

## Installed-site preservation

The target lacked authored CTA rules for 20 canonical blocks. Regenerated from its own catalog, replacing only those rules from authoritative root block specifications. All other spec fields, four-pack metadata, renderer catalog, target-owned promotions/search contracts and installed extensions were preserved. The target also required the existing source update-event helper and one commit call to retain HTTP event semantics; tested exactly-once emission.

Final deployment bases:

- Source: `output/http-canonical-gates-20261005/source-source-installed.json`, 1,630 hashes, 108 extension files including tests exact.
- Target: `output/http-canonical-error-20261005/target-source-installed.json`, 1,624 hashes, 86 extension files including tests exact.

Each snapshot derives from that site's preceding installed manifest; no whole-source overlay. Storage-inclusive private exports preceded deployments. Consumer indexes rebuilt with acknowledged journals; final consumer and media indexes ready on both sites. The target's final rebuild included the disposable acceptance documents, subsequently removed through normal guarded APIs.

All six owned documents, their history and private drafts were deleted. Original source 116 documents / 434 revisions and target 29 / 88 match exactly. Appearance, mail queue/templates, other private drafts and original API keys match their baselines. Both owned API keys were revoked, further requests returned 401, plaintext files removed; two revoked key audit records remain intentionally. Native/API sessions revoked, owned Electron 73194 and previews 73223/74493 stopped, isolated profile removed. User processes 39198/62672/65092 and retained RSVP fixtures preserved. No push.

## Remaining delivery work

This closes the coordinated HTTP create/read/update boundary in E07, not all legacy retirement or all block/API combinations. Live API acceptance exercised prose; plugin/composed resource authority continues to fail closed where a native actor is required. Generic public create APIs, WordPress/demo producers and remaining legacy schema consumers need caller-aware retirement. Full Tasks 3–8 acceptance remains incomplete; 117 Verified / 20 In progress unchanged. Claude audit 36 remains advisory and has its own Codex response.

Evidence roots: `output/http-canonical-20261005/` (HTTP/native/cleanup/roundtrip), `output/http-canonical-gates-20261005/` (draft validation/DTOs/20 target rules), `output/http-canonical-error-20261005/` (target structured-error regression/deployment).
