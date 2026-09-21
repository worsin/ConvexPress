# Canonical conversion and provider slice — source checkpoint

September 5, 2026. The shared production renderer now discovers 83 of the existing 136 canonical specifications. This adds `core/map`, `core/script-embed`, `core/newsletter-signup`, and `core/cta-with-form`; it does not activate canonical persisted content or claim complete catalog acceptance.

## Supported behavior

- Map uses authored coordinates/address and the reviewed OpenStreetMap consent adapter. Missing coordinates remain an explicit empty state. Authored directions links remain intact. The fictional example uses OSM's supported `to` query parameter, verified against its [directions implementation](https://github.com/openstreetmap/openstreetmap-website/blob/master/app/assets/javascripts/index_modules/directions.js).
- Script embed implements the schema's exact YouTube and Vimeo provider modes through consent-controlled sandboxed players. Provider scripts remain inside the external frame. Unknown providers and malformed IDs refuse; arbitrary first-party scripts are not supported.
- Both signup views use one typed, installation/client-bound host transport and the existing `emails/mutations:subscribeNewsletter` handler. Only its validated `{ok:true,status:"subscribed"}` receipt displays success. The handler subscribes a record; it sends no confirmation email and performs no trial, payment or account creation. Unactivated example copy now reflects that actual behavior. Authored success text remains authored data.
- Required capabilities come from generated metadata. Stored attributes cannot inject a transport, recipient or capability. Missing host transport disables submission clearly. The optional production provider is not mounted in the native private preview or public canonical routes.
- Submission retains valid entered email after an error, prevents duplicate pending calls, and clears stale state/results on client, scope, authored copy or unmount changes. Pending/success/error transitions move focus deliberately. All four installed packs use their actual primitive treatments, responsive layout and reduced-motion behavior.

BlockDemo defaults to disconnected. Its explicit local rejection and pending studies never report fake success. Its separate reviewed-deployment panel can connect an operator-selected exact HTTPS Convex cloud origin and perform the actual typed mutation on submission; it stores no origin, address or credentials. Only root performs live acceptance. Automated browser fixtures assert no Convex network calls.

The deferred contact-form block still requires a trusted document/form-bound backend submission service. That prerequisite remains required work, not a narrowed-away catalog mode.

## Evidence at the stable checkpoint

- Shared renderer suite: **76 passed, 1,818 assertions**, including all generated examples under all four packs, actual newsletter handler record/receipt behavior, duplicate normalization, malformed receipt rejection, stale responses and capability refusal. `/tmp/conversion83-final-renderer-tests.log`.
- Focus regressions were red before repair; retained at `/tmp/conversion83-focus-red.log`. Final suite includes successful confirmation focus and retry input focus.
- Website and isolated BlockDemo TypeScript both exit0: `/tmp/conversion83-final-website-types.log`, `/tmp/conversion83-final-demo-types.log`.
- Root, staged backend and portable source checks are current:136 specs and14 exact portable source files. No server adapter or Convex server graph enters Website.
- Offline production import closure: **83 modules, zero forbidden imports, no output written**. `/tmp/conversion83-final-closure.log`.
- Scoped lint and diff whitespace checks pass. Existing primitive/provider gate:15 tests/121 assertions. No dependency upgrades.
- Browser discovery: **28 tests in11 files**. `/tmp/conversion83-final-browser-list.log`.

Root browser acceptance is pending at this checkpoint. From `ConvexPress-Website/apps/web`, against the root-owned loopback server:

```sh
BLOCK_DEMO_URL=http://127.0.0.1:4318 bunx --no-install playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-conversion83 > /tmp/convexpress-conversion83-browser.log 2>&1
```

Expected new evidence:664 canonical captures (83×4 packs×2 widths),40 provider/signup captures and durable conversion-boundary JSON, plus prior focused gates. Provider frames are explicitly intercepted fixture documents in that automated test; this does not establish external playback or bookings. Suggested first visual review: mobile Journal CTA, desktop Depot newsletter, mobile Aster map and desktop Core Vimeo.

Contact79 remains separately accepted: root26 tests passed in2.1minutes,632 canonical plus32 contact captures, four reviewed visuals and four existing MagicTables row updates with exact readback. Actual unintercepted OSM and YouTube player loads are recorded separately under `output/aster-house/contact-provider`; no playback or booking claim is added here.

## Root browser acceptance

Root completed the stable full gate: **28 tests passed in2.5minutes**, under `output/block-demo/browser-results-conversion83`. Root personally inspected mobile Journal CTA, mobile Aster map, desktop Depot newsletter and desktop Core Vimeo. This records rendered/interaction acceptance for the83 slice; live newsletter and MagicTables evidence are being recorded independently by root. Source generation hold is released.


## Root conversion83 acceptance — September 5, 2026

The full root browser run passed 28 tests in 2.5 minutes (`/tmp/convexpress-conversion83-browser.log`). Filesystem inventory confirms 664 canonical captures, 40 conversion captures and 944 total PNGs including prior focused gates. Four representative captures were visually inspected: Journal mobile CTA, Aster mobile map, Depot desktop newsletter, Core desktop Vimeo consent. The provider frames in this suite were intercepted fixtures; this evidence does not establish external playback.

Both newsletter and CTA blocks were then connected explicitly through the demo UI to `careful-cormorant-268`, using their production typed mutation transport. Actual responses returned `{ok:true,status:"subscribed"}`; each success appeared and received focus. Full privileged table reads (evidence inspection only; submission was anonymous normal API) found exactly one shared subscriber record after both submissions and no matching row in production. One non-routable `example.invalid` staging subscriber remains as deliberate acceptance evidence. The existing handler dispatches no email and creates no login account. Receipts: `output/aster-house/conversion83/newsletter-acceptance.json`; rendered success screenshots alongside it.

Real unintercepted Vimeo loaded its player. Pressing Play resulted in a provider “Rights issue” authorization error, with currentTime0/readyState0. Playback is not accepted. The error screenshot and state are retained in `output/aster-house/conversion83/vimeo-acceptance.json` and `vimeo-live-player.png`. The owned browser was closed.

MagicTables standalone Blocks was freshly resolved/schema-read and all136 unique rows enumerated. A dry-run updated4 existing rows, created0; actual write and exact five-field readback succeeded. Evidence: `ConvexPress-Admin/output/blocks-tracker/renderer83-verification-2026-09-05.json`. The four rows remain In progress, with full-block Tests/Screenshots false because native canonical editor/save/publish and complete catalog acceptance remain unfinished. 83 renderer implementations have visual-suite acceptance;53 catalog renderers remain.
