# Contextual on-site Customizer selection — E90

The on-site picker now reveals covered header controls and focuses their own settings, including fields hidden by an existing settings search. Verified locally on 2026-10-06; no push or backend deployment.

## Failure and repair

The real four-pack header fixture reproduced 56 nearest-target failures: controls inherited `header.layout.sticky`. Added targets to top-bar slots, search trigger/field, CTA, guest links, user trigger, theme toggle and mobile-menu trigger. The real CustomizerPanel fixture also reproduced a filtered target that could not receive focus. Picking now clears that obsolete filter.

Actual authorized Website use exposed an additional causal failure: the fixed right-hand panel covered the theme/search/account controls and received the click. During picking, the panel now becomes invisible to expose the full page. A separate Cancel selecting button and Escape restore it. Choosing a target restores the panel and focuses its field while suppressing the target action. Local draft state remains mounted.

## Verification

- 18 focused tests across five files pass, including 56 actual-header target cases, previous header-control cases, actual panel recovery, setting relevance and module parity. Additional repeat-selection and Escape regression checks pass.
- Website TypeScript and production build pass. Changed-file lint passes. Full Website lint remains nonzero due to existing `no-control-regex` warnings in generated spec-runtime.mjs and lib/downloads/serve.ts; neither file changed.
- Actual built Website at the disposable source site, authorized via its registered one-time operator handoff: all four packs locally previewed, each with filtered theme/search/sign-in picking. All 12 cases clear the filter and focus the matching field. Theme remains light, search does not expand, sign-in does not navigate. Aster search selection repeated successfully. Cancel button and Escape restore the panel. Browser errors: none.
- Screenshot `output/customizer-targets-20261006/picker-focused.png` shows Aster House with the Search Variant field revealed after selection. DOM receipts record the focused field, cleared filter and unchanged route/theme.

The first browser attempt was the live overlap reproduction. A later same-document handoff retained the prior JS bundle; an explicit reload loaded the rebuilt bundle and required fresh editing authority. These setup attempts are not counted as accepted cases.

## Preservation and cleanup

Only local previews were changed; nothing published or saved. Original appearance snapshot, general/reading settings, menu locations, all 43 pages and four pack draft records compare exactly with the baseline. UI Close and discard returned Core; End website editing removed editing authority. API session revoked and refresh returns 401; private session/handoff files removed. Owned Website 57700 stopped, browser tab 27 closed, viewport reset; seven protected processes remain alive. No native runtime was launched for this on-site boundary.

## Remaining scope

E90 is repaired and verified for desktop on-site picking. Native iframe selection, responsive device iframe picking and full signed-in account controls remain E09 acceptance work. This does not close Task 5 or the delivery goal. Reuse earlier native draft/history/publication evidence rather than rerunning unrelated matrices.

Evidence: output/customizer-targets-20261006/{red,overlap-red,final-tests,picker-final,types,build,focused-lint,all-lint-detail}.log, browser-receipts.json, cleanup.json.
