# Canonical page headings — September 28

Status: implemented and verified, including the later actual built Website/native follow-through documented below. No tracker row or backend data changed. This closes the source defect behind E21, not the full editor/template goal.

## Failed workflow and causal boundary

Core PageContent and Journal/Depot/Aster page surfaces decided whether to show the page title by inspecting `page.blocks[0]` against four handwritten HERO_BLOCKS sets. The public content projection deliberately omits raw v2 bodies; canonical bodies arrive exclusively through the validated public document envelope. Consequently all canonical heroes received a duplicate template heading, and `core/hero-video` was absent from the lists even when a tree was available.

Repair remains within generated presentation metadata and page rendering. No raw blocks were added to public page queries and no additional subscription was introduced.

## Implementation

- Root generation emits `roles.ts`, a141-line data-only map for all137 specs, mirrored into the staged backend contracts by the existing generator. It imports no renderer, schema or editor code.
- PublicCanonicalBody exposes an optional `renderLayout(body, opensWithHero)` callback based on its current validated response. Loading, denied/error, identity-change and expired results retain a template heading instead of retaining a stale hero decision. The body still uses the existing authorization and installation lifecycle.
- The four page consumers render their original heading classes and content wrappers through that callback. Aster's md:text-7xl remains distinct from Journal's md:text-6xl. Blank/title-free branches remain title-free.
- Legacy pages share generated roles and retain one explicit `blocks/page-banner` compatibility alias. No HERO_BLOCKS sets remain. Legacy migration and the old large registry remain separate open Task4 work.

## Verification

Evidence directory: `output/delivery-reconciliation-20260928/`.

- Failing-before generator test demonstrated absent role output (`roles-red.log`). Failing-before public lifecycle test demonstrated the missing layout callback (`public-layout-red.log`). Initial incorrectly unqualified Bun paths scanned an old output checkout; the stored red logs were rerun with exact `./` paths. No old output source was modified.
- Eight generator/consumer tests pass, including deterministic regeneration and roles from arbitrary discovered specs (`roles-tests.log`).
- Two opening-role cases cover all four canonical hero names, empty/ordinary/unknown trees, the legacy alias and refusal to inspect a raw v2 fallback.
- Eight real public-body lifecycle/layout cases pass within the isolated test process, including all four actual page-layout components, canonical hero-video DOM and SSR, ordinary-content title restoration, access-loss clearing, stable subscription count, SSR hydration, source-only reusable updates, identity/lease/history changes and custom-definition revocation. Block paint and production submission adapters are isolated in this suite; it is not a screenshot or native visual acceptance claim.
- Five public display-state cases pass alongside those suites (`public-layout-tests.log`).
- The backend public-content projection regression passes33 expectations: page/post queries expose the v2 discriminator without raw canonical or legacy fallback bodies (`roles-privacy-boundary.log`).
- Website TypeScript, root check:blocks and check:block-kit pass. Template SSR smoke passes four home loading/registry cases, Aster cover, selective hydration and legacy streamed markup. The new page-layout SSR fixture supplements that existing limited smoke; it does not claim every template surface was audited.

No backend deployment was needed. User Electron PID39198 remains running. The pending follow-through is the next actual built Website/native batch; E20 lazy renderer chunks and E22 prescribed screenshot evidence mapping are still open. Tracker remains60Verified/77In progress.

## Live follow-through

See `canonical-lazy-renderers-20260928.md`: actual native authoring/save/reload plus16 built public cases across4packs at1440/390. Hero-first suppresses the template title; ordinary-first restores exactly one. All cases have no page/hydration errors or horizontal overflow. The owned fixture and sessions were cleaned with42 original pages/appearance preserved. E20 selective loading is accepted; the separate whole-bundle budget and E22 remain open.
