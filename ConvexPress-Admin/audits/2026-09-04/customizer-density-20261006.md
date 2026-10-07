# Customizer product-grid density — October 6, 2026

E79 is repaired: the visible Product grid density control now changes actual catalog layout in Core boutique mode, Journal, Depot and Aster House. E09 remains open for the full Customizer matrix. The same runtime pass proves a separate E80 Type scale defect; it is not fixed by this patch.

## Required workflow and root cause

Task5 requires a visible control to change its declared rendered surface. All packs expose `shop.gridDensity`; `useShopLayout` resolves the draft and `useShopCatalogData` returns it. Journal/Aster discarded that returned layout and hard-coded their three-column grids. Depot hard-coded its dense grid. Core consulted density only in marketplace mode, leaving boutique unchanged.

An isolated regression renders the actual four surface components with controlled network/loading inputs. All four failed before the repair because comfortable and dense produced identical result-grid classes. The repair consumes the existing resolved setting in each pack and applies the same grid choice to loading and populated results. Comfortable retains Core/Journal/Aster's original layout. Depot comfortable now follows the existing Core marketplace comfortable grid; dense retains Depot's documented original dense design. No setting/schema, catalog data, purchase behavior or backend change.

## Verification

- Four actual-surface loading regressions pass after failing before. Combined wrapper/shop resolver/settings modules:11 tests/56 assertions pass. The wrapper contains four surface cases.
- Website TypeScript, production build and focused changed-file lint pass. Build retains existing chunk/dynamic-import advisories. No whole-repository green claim.
- Real owned native Electron32368, existing main Admin4105, source staging4860, fresh Website4322: changed Product grid density to Dense and saw the actual iframe change from one card column to two at the native preview width. Undo returned the control to Default (comfortable) and Everything published. No Save draft or Publish used.
- A local parent fixture then exercised the existing preview-message contract against that same production Website. This is an explicit test host, not a second shipped Customizer. Four packs × two density values ×390/1280:16 populated cases. The source's two existing products remain present; all computed grid gaps change; Journal/Aster desktop columns3→4, Depot3→4, Core desktop remains3 with gap16→12. On phone Core/Journal/Aster columns1→2; Depot remains2 with gap16→12. All16 actual iframe widths match the requested width and no horizontal overflow occurs. Narrow Aster product titles/prices/actions visually inspected; native before/after and all16 screenshots retained.
- Initial host captures had375px frames when its control toolbar caused a scrollbar; two Depot captures preceded product load. They were rejected and retained separately, then replaced by correctly sized/product-loaded evidence. A label lookup and an iframe focus attempt failed without mutations. Initial Website launch lacked the app-level dependency symlink; corrected that acceptance setup and restarted only the owned preview after its confirmed module-resolution failure. These are harness failures, not accepted product passes.

## Separate Type scale defect — E80

A visible Type scale choice reaches `settingsCss` and changes `--type-scale` to0.94(compact) or1.06(spacious). The production Core catalog h1 remains30px and its eyebrow11px in all three states. Current source search finds no consumer of this variable. The field is therefore a no-op, not merely missing acceptance evidence. Next repair must connect scale to actual typography without accidentally scaling non-text layout, preserve comfortable defaults and verify SDK/owned-pack typography as well as native preview/reset. `type-scale-noop.json` records the measured values. No typography fix is claimed here.

## Preservation and cleanup

The complete source appearance snapshot, including revision, exactly matches the preflight after all previews. API session logged out and refresh refused401. Native original Promotion Lab Live4870 selection restored and normal signout verified. Owned Electron32368, preview32574 and test-host32614 stopped; private native profile removed. Main owner/native/Admin/BlockDemo and all four delivered example previews preserved and healthy. No data writes, backend deployment, purchase, publication or Git push.

Evidence: `output/customizer-density-20261006/`: red/green tests, types/build/lint, native screenshots, `rendered-matrix.json`, `render-assertions.json`, `type-scale-noop.json`, preservation and runtime cleanup receipts. Goal remains active;137blocks117Verified/20In progress unchanged.
