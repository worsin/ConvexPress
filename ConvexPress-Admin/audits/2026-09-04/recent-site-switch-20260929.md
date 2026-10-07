# Recently Viewed — real environment boundary

September 29 follow-up to `customer-commerce-20260929.md`. **112 Verified / 25 In progress / 137 remains unchanged. Recently Viewed is not yet accepted.** No product source or backend deployment changed. This closes the guest environment-switch evidence gap and establishes the specific prerequisite blocking its signed-in counterpart.

## Actual guest switch passes

A single persistent browser context used the same origin, `http://127.0.0.1:4322`, throughout. The actual Website process was restarted with the captured runtime configuration, first against source4860/staging/`promotion-source-20260911`, then target4870/live/`promotion-target-20260911`, then source again. These are the existing separate databases for `promotion-acceptance-20260911`; no browser storage, resolver response or identity was injected.

The source began empty. An ordinary product-detail visit produced the source product in Recently Viewed. On switching to target, the rendered block was empty while the source history remained in browser storage. An ordinary target product visit produced exactly the target product and a second scope-specific storage bucket. Returning to source restored exactly its original product and excluded the target product. Both buckets survived; no page errors. The actual target screenshot was visually inspected. All six source runtime values were compared exactly on return, including Admin origin `http://127.0.0.1:4105`.

The prior batch already proves native authored title/limit and exact revision recovery; actual Website preview; signed-in visit order/limit, publication withdrawal and same-browser account changes; and normal/maximum Core/Journal/Depot/Aster1440/390 layouts. Those results remain reusable. The original tracker Notes require full signed-in account/site-switch acceptance, so guest switching alone does not justify changing Status.

## Signed-in target prerequisite is missing

A separate clean browser signed into a disposable development Clerk customer on source and recorded an actual source product visit in the `user:<Clerk id>` history bucket. Source linked the customer correctly. The same customer and browser then switched to the actual target process.

The target shell recognized the Clerk browser session, but its backend logged **`No auth provider found matching the given token`** and the document stayed at **Loading document…**. The separately provisioned target customer profile reports **`clerk_secret_key_missing`**, `clerkProvisioningStatus: failed`, `authSource: local`, and no matching Clerk link. This is target customer-auth configuration/readiness evidence, not a demonstrated failure in the history-key implementation. No source history was rendered in target and no target/anonymous history bucket was written. Returning to source restored its original signed-in history exactly. Source sign-out then completed through the Website account menu.

This prerequisite is assigned to the existing **E18 integrated target-readiness work in Task8**. Its repair boundary is the chosen target's real customer identity configuration and matching installed auth provider, followed by successful customer provisioning/authentication and an actual signed-in source→target→source history check. Do not claim closure from a mocked scope change, guest proof, or merely a successful deployment. Do not replace the target's separate backend with the source. Source and target installed code snapshots were not redeployed during this test.

Recently Viewed stays open. Assistant Band still needs its configured model response/cart-tools acceptance; Script Embed retains its actual Vimeo gate. Forms are the next independent Task3 batch. Tasks4–8 and the full delivery goal remain open.

## Cleanup and identities

Both attempts are cleaned. Across the guest and signed-in attempts, four owned pages and four products were deleted through normal APIs. After each cleanup, the original42 source pages and28 target pages matched exactly, as did appearance values/identities and plugin values. The three original source products matched except normal joined category audit timestamps; target returned to zero products. Source category counts remain2 and target0. Both default categories predate these attempts. Target commerce was temporarily enabled for the owned product visits and restored to its original disabled value. Normal category/plugin audit timestamps were retained, not rewritten.

All four operator API sessions were revoked and both browser contexts/profile directories closed/removed. The development Clerk identity was deleted. Two inactive profiles remain through normal lifecycle APIs: source `nh8fgzfdkbyxph3tc7d0amw0yd8fbpb3`, target `nh82qrkwnm14qf9pzmtw9csba58fbq16`. Normal session/provisioning/audit history remains. No orders, payments or form/message submissions occurred. Existing records from earlier batches were preserved.

An initial fixture attempt sent the canonical `anchor` envelope through the legacy page-create block validator and was rejected. Complete page readback proved no page creation before the harness moved to the established canonical initialize/publication APIs. This is a fixture API mismatch, not an accepted product regression. Cleanup initially compared joined category timestamps as immutable editorial values; the recorded normal timestamp-only change was then compared separately, with acknowledged deletes skipped by the journal.

Final owned Website **PID69382 / PTY18114 / port4322**, source4860, exact captured six-field runtime. Owner Electron39198, Admin62672, BlockDemo65092 and SOCKS68390 remain preserved. No push or subagents. Audit19 arrived during this checkpoint and was read/responded. F26 prerequisite visibility is retained; its exhaustive owner-only conclusion and suggestion of acceptance without required proof were not adopted.

## Evidence

`output/recent-site-switch-20260929/`: source-visited, target-initial-empty, target-visited and source-restored JSON/PNGs; fixture and cleanup journals; both cleanup receipts; unchanged137-row tracker readback.

`output/recent-auth-switch-20260929/`: source-visited/source-restored JSON/PNGs; target-signed-in screenshot/state; target-auth-console; target-provisioning; signed-out; cleanup journals and both receipts. Private credentials and baselines remain outside the repository; the deleted Clerk identity and revoked API sessions must not be reused.
