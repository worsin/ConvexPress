# E84 Header layout controls — implementation checkpoint

2026-10-06. Task5 remains open. This checkpoint accepts controlled rendering evidence, not full native Customizer acceptance.

## Failure and repair

The focused regression initially recorded15 failures (`output/header-layout-20261006/red.log`). Journal/Aster ignored background, border and height; all three non-Core packs ignored arrangement, and Depot ignored height. Desktop browser measurement additionally placed Core centered branding at110.5px against a714.5px header center and placed its nav3px below the header.

`HeaderMainRow` now arranges actual pack-owned branding/navigation/actions for Standard, Centered and Split layouts. Equal desktop grid columns center the brand; centered navigation occupies its own contained row. Minimum heights allow content to grow. The three non-Core packs consume background/border/height settings, preserving their normal heights and Depot's standard departments row/search. Core uses the same arrangement and retains its responsive heights. Shared fixture setup is extracted from the existing branding regression.

## Fresh verification

- Focused layout and branding test files:2pass,0fail;28 layout assertions/52 actual-component cases and66 branding cases.
- Website check-types and production build: exit0. Logs in `output/header-layout-20261006/{types-final,build-final}.log`.
- Changed-file oxlint: exit0. Full Website lint remains red on unchanged `src/lib/downloads/serve.ts:47` and generated `src/templates/sdk/block-data/portable/generated/spec-runtime.mjs:313` no-control-regex warnings; details saved. No unrelated lint repair.
- Actual headers rendered with built production CSS and fonts in the in-app browser at1440x900 and335x900:52 cases each,104 total. Controlled auth/cart/search dependencies, one About menu link and configured Contact CTA; this is not the deployed site or native admin.
- All52 cases have no horizontal header overflow at either width. Measured mobile branding/actions do not overlap. All4 packs show strictly increasing Compact/Normal/Tall heights. Border widths are0/1/2/0 for none/subtle/bold/shadow, shadow is visibly styled; transparent has zero alpha and glass has partial alpha/12px blur.
- All8 desktop Centered/Split brands are within0.016px of header center; navigation remains inside the header. Core Compact/Normal/Tall desktop total heights are49/65/81px including border.
- Evidence: `before-core-geometry.json`, `desktop-geometry.json`, `mobile-geometry.json`, `geometry-verification.json`, `desktop.png`, `mobile.png` under `output/header-layout-20261006/`.

## Explicit remaining work

`scroll-up` currently follows the same sticky positioning as Always; Core also overrides selected background/border decoration after scroll. Repair and verify these before closing E84. Then exercise native Customizer layout changes, preview/history/save/reopen and actual Website output with scoped settings restoration. Search/dropdown/long-menu and all-action combinations are not covered by this controlled matrix. No block statuses were advanced;117Verified/20In progress remains unchanged. No backend/data mutations or deployment in this batch. No push.

## Closure update

The remaining scroll/native acceptance above was completed in `header-scroll-20261006.md`:shared directional behavior and Core scrolled appearance repaired; native4pack control publication, Core saved-draft reload and actual desktop/mobile Website output accepted with exact restoration. Refer to that report for final scope and limitations.
