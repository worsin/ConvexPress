# On-site Customizer context checks — September 29

Task 5 remains open. This pass reuses the prior natural-renewal/reconnect and Journal/Depot native promotion/conflict evidence, adds actual four-pack context checks, and repairs a reproduced repeat-picking defect. No appearance/content/private-draft save was performed.

## New observed evidence

An owned headed Chromium context used the existing source Website4322 and its source4860 database, with ordinary local-operator one-use handoffs. The handoff fragment was scrubbed before observations. It did not use the pending RSVP browser, alter the site origin, rebuild the Website or restart existing processes.

- Core, Journal, Depot and Aster House: on-site primary color #456789 reached computed root CSS; Undo/Redo and group Reset/Undo restored the appropriate values. All four screenshots inspected. These are shared color-control checks, not all-field or full-site design signoff.
- The home route marked Shop as Other pages. The actual `/products` route mounted shop.catalog and opened the relevant Shop group in all four packs. Existing two products rendered through Core boutique, Journal boutique, Depot marketplace and Aster boutique. All four final catalog screenshots inspected after waiting for settled product output. An initial `/shop` guess redirected to a missing canonical page; it was excluded. Initial screenshots taken during pack transitions were replaced after inspecting their blank content; those transient captures do not count as acceptance.
- Aster House phone preview received the same primary-color draft. Actual iframe width388, document scrollWidth377, no page errors; screenshot inspected. This verifies draft transport into the phone frame, not universal mobile design.
- Clicking the Core site branding in pick mode initially focused the real header.logo.showTitle checkbox and left picking mode without navigation. Repeating the selection exited picking mode but left focus elsewhere. `repeat-pick-before.json` records the failure.
- Explicit End website editing removed the panel. Reload on `/products/?customize=1` remained anonymous and did not reopen editing. This is anonymous denial and explicit end; it does not prove signed-in customer denial or parent revocation.

## E68 — repeated surface selection

The panel stored the selected field as a string and focused its control in an effect keyed only by that string. Selecting the same field again did not rerun the effect. Starting a new picking attempt now clears the previous selection, so every successful pick focuses and reveals its field, including repeated selection of the same surface.

The regression mounts the actual CustomizerPanel with controlled auth/settings, places a selectable rendered element outside it, closes the field group, moves focus away and selects that element twice. It failed before the repair and passes afterward, checking focus, group expansion and exit from picking each time. Six internal panel lifecycle cases /63 assertions pass (one isolated outer wrapper). Website types pass; refreshed central renderer317tests/5493assertions/1148executedcases and live137-row/117Verified tracker gate pass.

E68 is **implemented and component-tested; full refreshed Website runtime repeat-pick acceptance remains pending**. The existing source preview still runs its earlier production bundle because it hosts the human RSVP CAPTCHA. No source preview rebuild was performed. There is no claim that the old running bundle contains this fix.

## Task 5 evidence reconciliation

| Requirement | Reusable/current evidence | Remaining acceptance |
| --- | --- | --- |
| Palette/commerce/chrome migration | appearance-migration-outcome.md: receipts and registered-handler checks | Actual per-site migration/readback and runtime retirement |
| Combined native chrome | customizer-chrome-20260929.md: Core CTA/footer/menu/reset/save/reload/review/publish | Remaining pack-specific fields, menu columns/cell varieties and duplicate-runtime retirement |
| Fields/presets/history/context | customizer-packs-20260921.md: Journal/Depot palette/type/layout/shop/reset/history; this pass: four-pack color/history/context, Aster phone transport | Full per-field rendered-surface matrix, repeat-pick runtime retest, other contexts and frame sizes |
| Draft/conflict/switch/promotion | customizer-packs-20260921.md and customizer-chrome-20260929.md | Reconcile complete per-pack requirements and remaining Aster native workflow; avoid claiming full promotion from a frontend-only preview |
| Operator lifecycle | onsite-customizer-20260921.md; customizer-recovery-20260921.md; website-editing-continuity-20260921.md: natural renewal, same-tab recovery, explicit end | Real customer denial, live parent revocation, public HTTPS/local-network-permission behavior |
| Signed-in dashboard surfaces | Template handoff remains authoritative | Inventory and exercise all22 applicable surfaces, without adding extra dashboard features |

The later continuity report supersedes the earlier recovery report's statement that renewal/reconnect was unimplemented. Dashboard Customize link follow-up is now closed by the September29 native chrome report. Full Task5/E09 remains open.

## Preservation

Exact source appearance snapshot (including revision), general settings and all43 page records are unchanged. No durable draft or content mutation was requested. Only one-use handoff rows and the owned API login/session were used. The owned API refresh session was revoked and its private session file deleted; the owned browser closed after explicit End. Existing source runtime and pending RSVP fixture/browser remain untouched. No tracker row promoted, no push.

Evidence: `output/customizer-contexts-20260929/`: pack-contexts.json, products-contexts.json, products-rendered.json, phone-preview.json, click-to-branding.json, repeat-pick-before.json, end-anonymous.json, preservation.json, inspected screenshots, failing/passing panel logs, types.log, renderer.log and tracker.log. Private baseline stays outside the repository. Do not count the intentionally excluded `/shop` observation as catalog acceptance.
