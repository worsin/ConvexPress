# External embeds acceptance — September 29, 2026

Five rows accepted: `core/embed`, `core/map`, `core/booking-cta`, `blocks/contact-stack`, `core/iframe`. Tracker readback is **108 Verified / 29 In progress / 137 total**. Only these five rows' Status, Tests and Screenshots changed; all Notes and other cells match the preflight. Script Embed remains In progress for actual Vimeo playback in that block. These counts describe the block library, not overall delivery completion.

## Contract and native evidence

The actual specifications govern acceptance. Embed has URL/caption, with provider derived from the URL. Booking CTA has eyebrow/heading/body/CTA label/CTA URL/Calendly embed URL; it has no provider field. Contact Stack has heading/intro/phone/email/address/hours/map URL and up to eight contact rows; it has no form. Script Embed permits YouTube/Vimeo resource IDs, not arbitrary scripts, chat or analytics code. Historical tracker Notes were preserved, while the status file now reflects current fields.

Two owned real Electron sessions authored all six blocks, including text, numbers, links, contact-row movement, provider and resource ID. Initial save/reopen and revision recovery passed; a second native pass changed every provider URL, saved revision 13, reopened the controls and restored the independently matched original tree as revision 14. `native-exact-recovery.json` proves the revision-4 tree/title equal revision 14. The actual Website iframe and Mobile preview rendered correctly. Unsupported Embed URL retained the invalid draft, displayed the field-specific error and blocked Save. Both sessions signed out and closed; final private profile was removed.

## Published Website and providers

Final normal and maximum/empty matrices each pass eight cases: Core, Journal, Depot and Aster at 1440 and 390 pixels. Each checks real rendered block content, six consent panels, zero iframe/provider requests before consent, no page overflow and no first-party errors. Maximum cases include eight 300-character contact values, long unbroken labels/headings, coordinate extremes and all six empty states. Full text is retained.

Twelve uninterrupted live cases (six blocks at two widths) prove actual YouTube playback for Embed/Script Embed, OpenStreetMap map canvas/tiles/zoom for Map/Contact/Iframe, and Calendly calendar/month navigation for Booking. Keyboard consent, fixed sandbox/referrer/title, unload, restored focus and consent reset on reload pass. Two additional Calendly geometry cases prove all seven weekday columns fit, including the narrow iframe. No appointment or contact message was submitted.

Six deliberately aborted-network cases prove fallback links and unload/focus behavior; these are controlled failure tests, not successful provider loads. A normal saved URL change resets consent without requesting the new resource. Eleven installed invalid writes were rejected with the entire document unchanged.

### Vimeo boundary

[Vimeo's official SDK examples](https://github.com/vimeo/player.js/blob/master/README.md) identify the fixtures. Video 76979871 returned a rights error even with its official privacy hash; another sample required login. Installed Chrome successfully played 19231868 directly and inside the actual Website's **Embed** block at 1440 pixels, with advancing time, unchanged sandbox, no request before consent and successful unload/focus restoration. This closes Embed's missing legitimate Vimeo playback check, alongside the separate responsive matrices.

Subsequent Iframe attempts returned Vimeo's connection-security refusal. No challenge bypass or sandbox relaxation was attempted. Iframe's approved real-frame gate is met by OpenStreetMap at both widths; no successful Vimeo playback in Iframe is claimed. **Script Embed's Vimeo playback remains unproved**, despite native Vimeo save/reopen and actual YouTube success. Revisit once legitimate provider access permits; do not repeat the same restricted request or substitute a mock. Evidence: `vimeo-acceptance.json`, `vimeo-live.json`, `vimeo-live-failure.json`, `provider-chrome-probe.json`.

The Calendly fixture is the [public embed demonstration](https://www.calendly-embed.com/embed-options), linked from Calendly's own community guidance. It exercises the calendar without submitting a booking.

## Repairs

- **E53 — authored embed/action validation.** New saves/publication reuse the existing closed provider adapter and field-path errors. Unsupported hosts/provider kinds, malformed IDs, unsafe contact links and links without visible names are refused. Historical stored shapes and recovery remain readable/repairable. Native validation shares the helper; deterministic backend/Website mirrors include it. Validation checks syntax/capability, never remote availability. A valid-looking 11-character YouTube ID is not evidence of remote existence.
- **E54 — valid Contact Stack link crash.** Contact values allow 300 characters, but the shared Link primitive allowed only 240. Increase only Link's bounded label limit to 300. The actual renderer regression failed before and passes after; maximum-content pages now render all six blocks rather than being mistaken for empty successful pages.
- **E55 — maximum text overflow.** Consent headings, map addresses and contact labels could widen a 390-pixel page to 9116 pixels (1440 to 11904). Isolated wrapping changes proved the cause. Three targeted `overflow-wrap:anywhere` rules preserve all text and pass the final eight maximum cases.

## Source, checks and preservation

Base commit `99a0c8f8` plus this reviewed batch. Strict source-4860 deployment derives from the previously installed checkpoint: **1624 sealed files, 16 reviewed changes, all 22 Events files preserved, all 2410 function signatures unchanged**. Snapshot: `ConvexPress-Admin/output/production-checkpoints/external-embeds-reviewed-20260929`. Installed proof records source hashes and function-spec parity. Target 4870 remains separate.

Checks: 317 renderer tests/5493 assertions, 16 direct renderer tests/93 assertions, 13 focused backend tests/144 assertions, eight editor-model tests/118 assertions; backend/Admin/Website types, Website build, generated consumer contracts and kit freshness pass. These are the recorded focused suites, not a new full-repository green claim. The final helper-message-only change was followed by backend/Admin types, backend contracts and the reviewed Website build; earlier editor-model and Website type evidence remains applicable.

Owned Website PID 64979 / port 4322 serves the reviewed build with all six captured runtime fields preserved, including Admin origin `http://127.0.0.1:4105`. Owner Electron/Admin/BlockDemo/SOCKS processes are preserved. Test pages were normally trashed/permanently deleted; their two public routes return actual 404. Original **42 pages, 11 media records and appearance values** are exact; consumer index is ready. API session revoked; native profile removed. Normal appearance audit metadata may change. Prior batches' explicitly documented residual records were not modified.

Harness corrections were isolated from product defects: OpenStreetMap uses MapLibre, full viewport screenshots avoid partial GPU map captures, narrow Calendly uses a different heading and hidden offscreen month grids must be excluded from geometry checks. Live-provider tests were rerun sequentially because concurrent appearance/page updates reset consent. Neither stale selectors nor provider storage-access console messages justified weakening the sandbox.

## Evidence and remaining work

Evidence directory: `output/external-embeds-20260929/`. Primary receipts: `public-matrix.json`, `maximum-matrix.json`, `live-providers.json`, `booking-calendar.json`, `failure-reset.json`, `invalid-contracts.json`, `native-provider-fields.json`, `native-exact-recovery.json`, `native-final-proof.json`, `cleanup.json`, `installed-proof.json`, `mt-accept-verified.json`, `source-provenance.json`. Logs and PNGs remain local ignored artifacts; this tracked report is the durable interpretation.

Task 3 continues with customer-commerce. Remaining rows: 26 Task 3, two Task 4, one Task 7. Tasks 4–8, E18 integrated parity, E22 screenshot identity and E28 header separator remain open. E06 all-field and mixed reusable/composed/extension coverage and F21 full-corpus-or-explicit-incomplete migration remain assigned. Claude audit 18 adds no new finding; its review context does not override these evidence boundaries. No push or subagents.
