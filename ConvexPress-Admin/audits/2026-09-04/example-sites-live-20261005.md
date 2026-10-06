# Four authored staging sites — delivery checkpoint

Task6/E10 remains in progress. Four independently stored examples now run against real site backends and the actual Website renderer. This closes the empty-site provisioning gap; it does not establish finished visual/native/checkout acceptance.

## Available examples

| Pack / authored identity | Website | Backend / HTTP auth | Published documents |
| --- | --- | --- | --- |
| Core / Fieldwork Studio | http://127.0.0.1:4325 | Worker 4880 / 4881 | 5 |
| Journal / Slow Current | http://127.0.0.1:4326 | Worker 4890 / 4891 | 6 |
| Depot / Common Supply | http://127.0.0.1:4327 | Worker 4900 / 4901 | 5 |
| Aster House | http://127.0.0.1:4328 | Worker 4910 / 4911 | 5 |

Worker is 192.168.1.246. Admin's Acceptance Agency Group → Template Examples contains all four websites with registered staging instances and operator connections. Each site has its own Docker volume, identity, first-admin account and database. No paired production instances were created. All four use the existing immutable backend image and 1536 MiB / 1 CPU limits. All were running after deployment; available Worker memory was about 5.9 GiB at the final check. Existing source/target/controller containers were not changed.

The standard target snapshot from `output/canonical-mode-retirement-20261005/target-source-installed.json` was deployed to each new instance: 1622 file hashes and 2359 exported function signatures matched. No deployment to the original source or target occurred in this batch.

## Completed live work

- Authored all 21 canonical documents with the receipt-based CLI through normal APIs. Before publication, rerunning each journal changed neither posts nor revisions: Core 5 posts/10 revisions; Journal 6/9; Depot 5/9; Aster 5/10.
- Activated the corresponding pack; configured static homepage, header/mobile/footer navigation and appearance with the ordinary settings/menu and revision-checked appearance APIs. Published all owned documents using expected revisions.
- Added three real Depot products with prices, SKU and stock; enabled commerce on that dedicated site. Added two real Aster Events records and published them with updated-at conflict checks; enabled Events only there. Committed resource recipes under `examples/sites/resources/` preserve the authored input. Events are explicitly fictional and RSVP is closed. The supper was corrected to 18:00 America/Denver on May 8, 2027.
- Replaced provisioning briefs in visible taglines/footer copy with authored site identity copy. Resource dates and prices are demonstration content, not offers from actual businesses.
- All 21 public routes returned HTTP 200 and their expected title in SSR output. This is HTTP evidence, not full browser acceptance for all routes.
- Actual in-app browser: all four homepages rendered; Core mobile-menu Approach link loaded the correct page; Journal homepage CTA loaded The public bench article; Depot catalog displayed all three products, the cup detail displayed $24 and 18 in stock, Add to cart produced one item/$24 and Remove restored empty/$0; Aster experience link loaded its two-event calendar and garden event detail with expected date/time/venue. Depot and Aster captured browser error logs were empty at that check.

## Repair and limits

Core's initial Home menu item used `pathOverride: '/'`, which the existing page-item validator rejects. The menu creation had succeeded, while authoritative menuItems readback remained empty. The rejected operation was recorded and the existing menu reused with the supported custom URL `/`. No duplicate menu or blind replay. Other packs used the corrected input.

The narrow-screen override attempted during this batch did not take effect for the background Journal tab: observed innerWidth was 1280. It was reset. No 390px responsive pass is claimed. Core's menu was observed at its actual narrow initial viewport, without a full responsive acceptance claim.

Open work: owned photography/media, form records and submissions, product variants/category polish and checkout/order acceptance, author profile/masthead, remaining copy/layout refinement, full desktop/mobile/keyboard coverage, actual native Electron edit/reopen/Website-preview round trips for these four instances. Core's mobile drawer still exposed Sign In despite the configured header user-menu disable setting; investigate its actual setting contract before any repair. Built Website artifacts were reused from the accepted Aster canonical-homepage batch; final candidate/hash parity is still Task8.

The resource recipes are fixtures, not an idempotent resource-import command. Do not blindly rerun create operations. The draft CLI intentionally refuses reuse of a draft receipt after publication changes its revision/status; subsequent editing uses canonical expected revisions.

## Preservation and runtime handoff

Four owned site API sessions were logged out; attempting refresh returned 401 for each. Their token/session files were removed. Durable example accounts and deployment credentials remain private outside the repository; no credentials are in the report or recipes. Operator sessions were closed by their helpers. User sessions and existing native/Admin/BlockDemo processes were not stopped.

Control-plane readback compares original organizations, businesses, websites and instance configuration. Instance updatedAt timestamps can change independently through connection health updates and are recorded separately rather than falsely reported exact. The intended additions are one business, four websites and four staging instances. See `control-preservation.json` for the actual comparison.

Website processes are retained as deliverables. Owned runtime receipts identify their PIDs and ports; these must not be confused with the preserved user processes. Backend containers and volumes are durable examples, not disposable acceptance fixtures.

Evidence directory: `output/example-sites-20261005/`. Read `{pack}-deployment.json`, `{pack}-bootstrap.json`, `{pack}-attachment.json`, `{pack}-authoring.json`, `{pack}-configuration.json`, resource/identity receipts, `route-http-proof.json`, `control-preservation.json`, `session-cleanup.json`, and `{pack}-runtime.json`. Pending operations must be reconciled before retry. The next bounded delivery work is owned media and form/live-resource completion, followed by native and responsive acceptance. Block inventory stays 117 Verified / 20 In progress; no overall completion or production-ready claim.
