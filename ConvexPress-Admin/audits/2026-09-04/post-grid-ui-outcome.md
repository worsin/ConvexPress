# Post Grid: renderer, editor and staging acceptance

September 6, 2026 UTC. Renderer/browser acceptance is now **91/136**; 45 renderers remain. This is a scoped milestone in the original production-readiness goal, not full production approval. The preceding reader/index checkpoint remains relevant; this pass connected it to the application.

## Delivered behavior

Registered `canonicalDocuments:getForRender` accepts a bounded visitor cursor map, validated before source reads. The service obtains the current authorized document, installation and policy, then supplies the indexed Post Grid reader. Independent grids bind their positions to saved filters, current scope and document identity. The same page query resolves all blocks. Anonymous SSR and reactive client reads carry the requested position; display grants invalidate across viewer/document/request changes. Homepage, page and blog routes preserve their actual URL for pagination. Absent pagination stays absent in search state.

Category/tag ID choices reuse the bounded, document-authorized taxonomy picker. A new closed author-choice endpoint returns only IDs and public display names from active site users, excluding controller identities. The real editor supports all three references. Optional references reset by removing the field rather than storing an invalid empty string.

The renderer uses template-owned primitives for editorial cards, safe public links, metadata, image aspect ratios and excerpt formatting. Container queries produce one/two/three columns. Image hover uses a transform transition and disables motion under reduced-motion preference. Pagination distinguishes a fully empty collection from an underfilled scan with a continuation, supports older/newest links and preserves other grids/search state. BlockDemo has nine explicitly synthetic stories and interactive history navigation. The saved native preview renders its first page; further pagination is available on the public website.

## Defects found and repaired during acceptance

- `InstalledDataView` consumed but did not forward `blockId`; the new regression caught absent pagination links. The wrapper now forwards the validated identity.
- Shared schema-form Reset used `initialFieldValue ?? ""`. Resetting an optional author introduced an invalid empty ID and disabled saving. Real Electron reproduced this; the shared reset now omits absent values for non-array fields, preserving array-row rules. A DOM regression proves a different selected filter and page limit survive.
- Returning an empty pagination object from route search validation caused real HTTP307 redirects to `?blockPages={}`. Browsers followed them, but the release verifier correctly marked the initial artifact uncertain. Empty pagination is now omitted. The actual Worker acceptance gate checks initial HTTP responses with redirects disabled, as well as next-page content. No release verification was weakened.

## Verification

- Full backend: **2,209 tests / 9,229 assertions**, 155 files. Registered document tests include independent grid positions, author filtering, hidden-source revocation, draft-parent denial and malformed requests.
- Renderer suite: **90 tests / 2,728 assertions**, including real-route independent next/reset links, exact installed data, revoked grants, empty continuation distinction, route-decoded JSON and hostile input.
- Picker DOM: **6 tests / 46 assertions**, including category/tag slug and ID storage, author choices, authorization recheck and aborted selection. Shared form DOM: **5 tests / 31 assertions** (isolated wrapper also passes).
- Both frontend type checks, explicit backend types, both19consumer fixtures and media/discovery writer gates pass. Four generated block/foundation checks show no drift.
- BlockDemo: two focused browser tests, four packs ×1440/390px,16 screenshots. Checks include image loads, responsive columns, no overflow, keyboard activation, next/end/reset states, history navigation and reduced motion. Final focus handling returns keyboard position to the demo collection after pagination.
- Production build and actual workerd acceptance pass for all four packs ×homepage/page/blog, including first and next grid pages, current-route URLs, no first-page leakage after pagination, initial HTTP200 without redirect following, and missing/revoked document HTTP404. Existing bundle-size warnings remain a broader performance concern.
- Real Electron **PID45019**, renderer4105, selected Aster House **staging**. Added Post Grid to Navigation field guide (`x17s7ch3wje4v646g3mbksm4x58dtav4`). Author picker showed Aster Editor and River Guest, excluding controller. Saved Aster Editor filter returned exactly Objects with a place from the registered anonymous query. Reset author, saved limit1; connected saved preview renders the current first page.
- Anonymous live browser traversed **Objects with a place → Why we keep a field notebook → The first hour of the day → newest**. Reload retained the second page. Mobile390 rendered the expected card/image without horizontal overflow. Final mobile and native-window screenshots were visually inspected; early captures before image decode/paint are retained only as diagnostic evidence.

## Staging release and evidence

Immutable backend checkpoint: `ConvexPress-Admin/output/production-checkpoints/post-grid-ui-20260906`,1,078 files. Dry run and actual deployment passed; six indexes added, none deleted. Deployment `careful-cormorant-268` is healthy; instance `cloud_careful_cormorant_268_staging`, website `aster-house:aster-house`, and media epoch `staging_2b3b1656f22543efa6f5d9d68b6e1aac` were preserved.

Initial Website release `nx73s1p8t5x176fdcpqq16x9gn8dxsp4` was uploaded but correctly uncertain due to the redirect defect. The corrected artifact was published through the normal native Reconcile and publish flow. Final release **nx77h0ayzybd17t6gepw1w09358dxkhp** succeeded, artifact **23bd5974989dcbfc47b27fbe557a90f42cfa8ffb3ca09cbe41873a228af0bcad**. Independent HTTP headers match the staging instance/release/artifact and homepage HTTP200. Production and Vercel were not deployed.

Evidence: root `output/post-grid-ui-20260906`; screenshots under `output/playwright/post-grid-20260906` and `output/block-demo/post-grid-ui-focus-20260906`. Final native screenshot is `native-preview-final.png`; final mobile screenshot is `live-mobile-final.png`. MagicTables Standalone Blocks row `px795wp8ed53b64z2dft30n0rd8dv7se` received a Notes-only checkpoint; exact read-back proves other fields unchanged. Full-block flags remain unclaimed.

## Remaining work

The reader's explicit256relationships-per-post publication ceiling and raw/partial restore index repair remain documented backend work. Independently verify automatic media readiness after the deployed writer-version change when continuing fleet acceptance. Complete the remaining45renderers, full default-template/plugin/BlockDemo acceptance, original24-item audit and Claude handoffs, deployment/recovery/backup/packaging requirements, and final production verification. Native preview pagination beyond the first page is not implemented. The original checkout is untouched; no commits or pushes were made.

Final HTTP receipt is `output/post-grid-ui-20260906/final-http-verification.json`: curl with no redirect following returned200 and exact final release/instance/artifact headers. A separate default Python urllib request returned403; its cause was not established. Native provider verification and the actual anonymous browser passed. Retain that client-specific observation for hosting acceptance rather than claiming all HTTP clients behave identically.
