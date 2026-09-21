# Content access live acceptance — September 20

The original A01, A02 and A03 acceptance requirements pass on the isolated Promotion Lab staging deployment, including real Clerk customer identity, authorized local administrator reads, live Website rendering and anonymous SSR. This does not establish overall release readiness, every role/organization combination, or template/block visual acceptance.

## Product repair

Both password-verification queries failed on the deployed Convex runtime with `TypeError: dynamic module import unsupported`. Replaced the dynamic imports of the existing comparison helper with static imports in `posts/queries.ts` and `pages/queries.ts`. Password comparison and public projection policy are unchanged. The initial live matrix failed 18 of 318 checks: 16 password cases and two missing search positives. After repair and fixture indexing, the final matrix passes 318/318.

The staging fixture had zero lifecycle listeners and therefore did not index newly created content. Explicitly indexed only the 24 owned acceptance documents through the authorized reindex action. This establishes access filtering, including a deliberately stale index; it does not establish fresh-install listener bootstrap acceptance.

## Evidence matched to original requirements

| Requirement | Current live evidence |
|---|---|
| A01: public DTOs and authorized reading | 24 documents: post/page × legacy/canonical × public/draft/private/password/member/future. Anonymous and real Subscriber ID/slug/path/published/canonical reads, lists, sticky posts, tree, search, suggestions and feeds with protected body/authoring/password markers; local administrator positive reads. Correct/wrong passwords and membership intersection covered. |
| A02: customer is not an editor | Subscriber cannot read unpublished documents or use editorial preview/canonical authoring endpoints. Authorized local administrator can read all 24 and preview legacy autosaves/canonical blocks. An attempted customer-to-Editor role assignment was correctly rejected as identity-incompatible; it was not used to manufacture editorial authority. |
| A03: secondary channels and stale state | Twelve configured-homepage state/format combinations; 24 stale-index checks after legacy password/private and canonical private/draft transitions; three actual RSS/RSS2/Atom HTTP responses. Public positive controls and protected marker absence both asserted. Homepage setting values restored after each test. |

Additional proof:

- Final live API matrix: **318 passed, zero failed**.
- Anonymous HTTP/SSR: **36 passed**, including direct and `/page/` paths, actual rendered public markup, serialized payload protection and 404 for unpublished documents.
- Membership API grant/revoke: **12 passed**. Password plus membership intersection: **48 passed**, anonymous/customer, wrong/correct password, before grant/after grant/after revocation.
- Actual Website password form: wrong password rejected and correct password renders content for all four post/page × legacy/canonical combinations. Both legacy and canonical protected homepages also unlock correctly.
- Four simultaneously open member pages update without reload: grant rendered in **930 ms**, revocation removed the body in **833 ms** after the fixture capacity correction below. Selected restriction screenshot inspected.
- Existing registered-handler content suite: **58 passed / 558 assertions**. Backend TypeScript and actual typed Convex deployment pass. Focused lint: zero errors, one pre-existing unused-type warning. Whitespace check passes.

Evidence directory: `output/content-access-live-20260920`. Primary receipts: `matrix.json`, `ssr.json`, `membership.json`, `intersection.json`, `home-discovery.json`, `feeds-http.json`, `browser.json`, `homepage-browser.json`, `cleanup.json`, `deployment-source.json`, `worker-headroom.json`.

## Test runtime corrections and limits

The first Website harness omitted `CONVEXPRESS_INSTANCE_KEY`, so canonical runtime rendering correctly refused the unbound installation. Restarted only the owned port4322 server with the actual staging instance key. Legacy fixture pages initially used HTML instead of the editor's TipTap JSON format; corrected the twelve owned legacy fixtures and reran the complete API/SSR checks. Neither harness mistake was patched around in product code.

Concurrent browser subscriptions exposed worker starvation in this manually created staging container: eight isolate workers versus admission limits of eight queries, eight mutations and four V8 actions. Queue expiration delayed revocation. Changed only `MAX_ISOLATE_WORKERS` from8 to32; image, volume, ports, request admission and remaining environment preserved. Repeated four-page grant/revoke completes under one second. This is a measured regression case, not a production load or memory-capacity certification. Apply/verify adequate headroom as part of remaining fleet/provisioning acceptance.

## Preservation and cleanup

Full database/storage snapshot taken privately before deployment. All1401 generated Convex source files match the post-fix manifest; only the two intended query modules changed before deployment. Original42 pages and2 non-trash posts compare exactly with their preflight records. General/reading/plugin setting values restored; previously implicit reading defaults now have a persisted settings record. Original membership restriction rules unchanged.

All24 owned documents are trashed and absent from public discovery; future documents moved to draft before trash. Four owned membership restrictions removed, test grants revoked, and test plan archived. Customer signed out, Clerk development user deleted, local profile deactivated, operator refresh session logged out. Owned Website server and browser stopped; original application processes preserved. No emails or payments were sent.

## Concrete remaining findings

- Canonical document settings currently have no visibility/password-editing contract; legacy update correctly rejects those writes on canonical documents. Existing protected canonical documents read/unlock correctly, but authoring those setting changes needs completion in the editor/service contract.
- `search/actions:reindex` checks capability only for full reindex; incremental requests currently require authentication without the same capability check. Source-confirmed authorization follow-up; no unauthorized write was performed here.
- `membership/mutations:deletePlan` iterates all restriction rules and deletes any with an empty plan list, even when unrelated to the deleted plan. Source-confirmed follow-up; this cleanup archived the owned plan instead of calling that mutation.

These remain tracked work. Closing the three original read-access findings does not close these separate mutation/authoring requirements.
