# Aster House cloud acceptance

This is partial production-readiness evidence, not a release approval. The public manifest at `output/aster-house/site-run.json` records actual resource IDs and release receipts. Credentials, invitation token, Clerk claim URL and browser state remain outside source in the protected acceptance directory.

## Latest control-plane checkpoint — September 5 UTC

- Both native environment health cards now show actual healthy/compatible runtime versions after Test. A native staging full backup verified267tables/15files/1,417,220bytes, and real scheduled health recorded a healthy observation. Receipt IDs/hashes are in the manifest and dedicated outcomes; no restore has run.
- Genuine private Cloudflare application OAuth was registered and connected through the restarted Electron relay. The existing Aster hosting account now uses encrypted OAuth credentials with automatic renewal support. First consent is proven; actual expiry renewal/public-client verification remain unproven.
- Deployed API guards reject cross-environment full-snapshot clone, promotion, and restore, with unchanged production operation history after three real denial tests. Allowlisted content promotion remains unfinished.
- Native recovery controls now distinguish content promotion from same-environment disaster recovery. The observed reactive-panel freeze was traced to an isolate-worker admission mismatch. A controlled CP-only worker-pool change from 8 to 32 allowed cold staging Operations to load in 949 ms, production to show no staging restore choices, and a persisted maintenance edit/revert, with zero captured browser errors. This verifies the exercised workload, not general fleet capacity; see controller-query-budget-outcome.md.

## Latest verified checkpoint — September 4 late session

- Both cloud databases received the shipping fingerprint and merged-settings/listener-preservation repairs through typed Convex CLI deployments. Staging storefront releases were published through the actual Electron controls.
- Real customer checkout calculated and selected Utah delivery at $7. The $38 Forest camp mug produced a $45 manual-invoice order, `CP-2026-281722` (`qs76wcg234trxcsk734snp07j58dva3q`). Backend readback confirms shipping700/total4500 cents, one item, pending order/payment, and inventory24→23. No payment was charged. `customer-checkout-review.png`, `customer-order-confirmation.png` and `customer-order-detail.png` contain rendered evidence.
- The customer can open the real order detail, see the mug, quantity, $45 total, pending payment and unfulfilled status. This initially rendered the orders list at the detail URL; order/return/subscription detail routes now inherit the dashboard shell directly. Return and subscription detail workflows themselves still require their own records and acceptance.
- A partial `general` date-format save now preserves all other effective settings, including the staging URL, and restoring the original format passed. Saving and restoring the email sender name preserved all155 listener records byte-for-byte, including the two disabled LMS email handlers; delivery remained disabled.
- The real page-create API rejected an unknown block type and did not create a draft. Home, story and demo pages each render one main landmark. The Explore target sits below the measured138px sticky header. Gallery ArrowRight navigation, Tab within the dialog, Escape dismissal and opener-focus restoration passed.
- The local run manifest was recovered after a missing callback argument overwrote that evidence file. No application data was affected. Original authoring returns and current live IDs were used for recovery; missing historical intent timestamps are explicitly identified. The validated writer now rejects missing arguments before disk writes and keeps a prior valid checkpoint. Exact original image prompts and hashes are recorded in `output/aster-house/image-provenance.json`.
- Email delivery is disabled globally on staging. Two settings-change alerts generated before disablement were cancelled while queued; the current queue contains those two cancelled rows only. A routine settings hook that reactivated disabled listeners was repaired and verified as described above.

Latest repeat-checkout acceptance: the closed-cart and persisted-label fixes are deployed, fresh staging artifact e543dc5b1d61 is published, and a second synthetic manual-invoice order passed with the correct label, empty converted cart, preserved first order, stock 23→22, and zero captured browser errors. Historical first-order labels remain unchanged. See checkout-acceptance-outcome.md for exact receipts. Safe content promotion remains a production blocker: full snapshot replacement copies operational/customer/configuration data and must not be treated as content publishing. The bounded cross-environment refresh/API credential defense is deployed; it does not make full replacement safe. Earlier sections below describe prior checkpoints and do not override these latest observations.

## Provisioning and publication

- Created Aster Studio → Aster House → Aster House in the actual desktop interface. Production `successful-seahorse-672` and staging `careful-cormorant-268` are separate cloud databases under personal Convex project 2936848.
- Both passed desktop installation and controller-connection checks. Installation uses the isolated backend package with TypeScript validation enabled.
- Published the staging storefront through the desktop Cloudflare publishing flow to https://aster-house-staging.h5s.workers.dev. The manifest records the latest succeeded release; publication was followed by rendered browser checks.
- Production has no published Worker yet. Custom domains, Vercel publication, production content promotion and installer/fleet acceptance remain open.

## Authored site and rendered checks

- Aster House template; homepage with Field Guide, live Upcoming Events and product showcase; two additional public pages; three original posts; header/footer menus; three original generated images.
- Three future Events render correct descriptions, dates and America/Denver timezone. Updating one event originally crashed the reactive homepage with InvalidCursor. The stable-window repair is deployed to both backends and the website. An event edit then appeared without reloading or resaving the page, with no browser errors; restoring the description also propagated live.
- Two physical products render their images, stock and prices. A digital reading guide remains draft until an actual deliverable and download flow are verified.
- Storage-only form accepted three synthetic fields through the browser, persisted a complete submission, and displayed its confirmation. Authenticated email queue inspection found zero messages. Form notifications and post-submit actions were disabled before publication.
- Two-image gallery and three help articles render. Gallery Close/Previous/Next names, image count, navigation and return focus passed on the deployed repair. Closed support panel controls are removed from the DOM. Further keyboard/mobile checks remain.

## Customer identity and learning

- Created a development keyless Clerk application for staging via the normal app connection action. Desktop Apply configured its issuer/keys and redeployed successfully. The app's real-token probe passed. Claiming the app into an owned Clerk account and configuring profile webhooks remain open.
- Invited synthetic `aster.river+clerk_test@example.com` as subscriber with invitation notification disabled. Used Clerk's documented development test token, CAPTCHA test-harness flags and fixed email verification code. These checks do not claim manual CAPTCHA acceptance. Signup reached the rendered customer dashboard as River Guest.
- Customer identity is distinct from the managed administrator. Admin access returns null, a privileged email-queue read is forbidden, production rejects the staging customer token, and the agency controller rejects it. These are specific observed boundaries; complete organization/business/client fleet RBAC acceptance remains separate.
- Published a free text course with one topic and three complete lessons. Customer enrolled through the website, opened all lessons and marked each complete; 3/3 and 100% survived a page reload.
- Published Aster Circle manual-grant plan and its notebook only after verifying the page restriction. Anonymous and signed-in nonmember views withheld the body. Granting membership revealed it live; revoking removed it live without a reload. A replacement demonstration grant restores the member's access.
- Exactly two staging LMS email listeners (enrollment and completion) were deactivated for these tests. Their IDs and reason are in the manifest. Preserve them during bootstrap and subsequent acceptance.

## Fresh-install repairs proven in cloud

Initialization originally omitted default listeners, built-in email templates and the default category. Missing-only bootstrap now registers these while preserving customized or disabled existing records and avoiding historical event replay. Both cloud deployments were repaired: 59 email templates and a default category added to each; 155 listener rows per environment. Staging's disabled LMS email listeners remained disabled and its email queue remained empty. Source initializer wiring is implemented; rebuilt native/package acceptance of the newly added initialization steps remains open.

## Current checkout blocker

The customer added one Forest camp mug, with correct quantity and $38 subtotal in mini-cart and full cart. Checkout reached review with synthetic contact/address data; no order was placed and no payment was attempted. Fresh defaults offered unconfigured Standard/Express shipping, and the selected manual method persisted a zero shipping amount. Review therefore showed $38 total with Standard shipping despite no configured shipping method. Repair must derive real configured shipping availability and prices and reject stale or fabricated selections at the server. Customer contact prefill and provider-specific shipping copy also need correction. Card payments correctly report unavailable on this unconfigured staging store.

## Documentation used

- Clerk test email/OTP behavior: https://clerk.com/docs/guides/development/testing/test-emails-and-phones
- Clerk testing tokens: https://clerk.com/docs/guides/development/testing/overview
- Test harness implementation inspected in the published `@clerk/testing` 2.2.33 package; only the documented development testing token/CAPTCHA flags were applied. Application responses and customer data were not mocked.


## September 5 additional provider/customer acceptance

Real app-owned Cloudflare OAuth expiry renewal succeeded during native publishing: generation1→2, ready, release nx7er2xpvjn75rda1yyqhs7hgn8dvy2t; no repeated consent. Credentials remain outside evidence.

The customer explicitly enrolled through Enroll now and the dashboard now shows the course with all3 prior lesson completions (100%). Earlier statements of enrollment acceptance were too broad: open-course progress had been verified, while active enrollment had not. Current enrollment was rendered and recorded. Direct subscriber posts-route permission gating is being repaired; other inspected dashboard paths and captured screenshots do not imply every pack/surface is accepted.
