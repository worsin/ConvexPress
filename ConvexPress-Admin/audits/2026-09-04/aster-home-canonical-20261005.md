# Canonical Aster homepage and Website DTO retirement — October 5

Aster's authored homepage chose its cover and prose wrapper from archived route contentMode/blocks, although its body rendered the authorized canonical document. A canonical Hero Video therefore received a duplicate template cover. The hardcoded hero list also omitted that canonical role.

Aster now obtains both body and opening-role layout from PublicCanonicalBody. PageDetail/PostDetail and their route projections no longer carry obsolete raw body, mode, sections or block-version fields. The unused legacyPageOpensWithHero alias is removed. Historical database fields, import/promotion contracts and recovery snapshots are preserved.

## Verification

Evidence: output/aster-home-canonical-20261005/.

- Red: actual Aster component regression initially found an unexpected h1 for canonical Hero Video with misleading archived route data.
- Green: public-body lifecycle, four-pack canonical surface dispatch and opening-role wrappers pass (3 wrapper tests; inner scenarios include SSR, canonical hero-to-ordinary update and access loss).
- Website types and production client/server build pass. The complete template SSR command passes: four loading surfaces, authored Aster escaped cover/media, lazy registry, selective hydration, retained legacy utility and 12 canonical nested/reusable/custom scenarios.
- Updated the offline authored-cover SSR fixture to supply the auth provider required by the real canonical body; the previous fixture failed with a missing-provider error. No network-backed site fixture was substituted.
- Actual built Website source page/post and target page return their expected canonical body in SSR and hydration, at desktop and 390px mobile; no browser errors and no horizontal overflow. Both configured home feeds render. Target mobile screenshot inspected.

Both sites currently use Core and have no static front page. These live checks do not establish configured Aster homepage end-to-end acceptance. That remains part of E10's authored example websites. The actual Aster regression and offline SSR prove this bounded layout change.

## Preservation and next boundary

No backend deployment or site data writes. Owned preview processes93501/93518 stopped, Playwright closed; user processes39198/62672/65092 preserved. Latest installed bases remain output/generic-update-retirement-20261005/{source,target}-source-installed.json.

Current Website src contentMode references are adversarial test fixtures only. Old BlockListRenderer, article/structured renderers and registry utilities still exist outside current page/post route dispatch. BlockDemo original-utilities and SSR compatibility fixtures reference part of that closure; retire only proven unused modules and preserve supported demo/SDK dependencies. Canonical backend identity, history/import and promotion discriminators still require explicit contract decisions. E07 and the full delivery goal remain open;137 rows remain117 Verified/20 In progress, not a delivery percentage. No push.
