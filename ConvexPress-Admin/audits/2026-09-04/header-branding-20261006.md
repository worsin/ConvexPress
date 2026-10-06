# Header branding controls — 2026-10-06

Task 5 / E09 / E83. Consumer repair verified; native Customizer save/reopen acceptance remains open.

## Reproduced failure and repair boundary

All four actual header components ignored Logo Size. Core never passed logo settings to SiteBrand, so its image/title/tagline controls were ineffective in standard, centered and split layouts. Journal/Aster forced the home tagline on and title fallback could ignore the title switch. Depot also forced title fallback. Turning branding off could leave title/tagline content visible.

The new isolated actual-component regression failed 40 of its initial 54 cases before the repair. Earlier fixture import failures were harness setup (Vite registry discovery and unrelated auth exports), not product evidence. Test doubles cover external hooks and unrelated overlay/registry discovery; actual headers, Wordmarks, SiteBrand and branding logic execute.

A shared resolver applies the existing five logo controls. Core passes the config in all three layouts. Each pack retains its medium image size (Core/Depot32px; Journal/Aster28px); small/large adjust by8px. Intrinsic dimensions and rendered height agree. Image-disabled text fallback respects Show Title; identity-level showTitleWithLogo=false is retained when an image is actually visible. All-off branding produces no empty home link. Journal/Aster retain their homepage tagline placement, now gated by enabled/showTagline. Core renders an optional tagline beneath its title. Depot retains its large-screen accompanying tagline, but a tagline-only brand remains visible on mobile instead of creating an empty home link.

## Verification

- Final regression:66 actual-component cases, four packs and all3Core layouts. Includes three sizes, enabled/image/title/tagline controls, identity title preference, all-hidden and tagline-only combinations.
- Layout/hook suite:15tests pass,29Bun expects plus fixture Node assertions.
- Website TypeScript passes. Production build passes. Changed production files lint0warnings/0errors; CLI itself emits a Node deprecation notice.
- Actual browser with compiled production CSS:78 rendered combinations at335px and1440px =156 cases. Every present image loaded and its measured height matched the selected size; no header horizontal overflow and no empty visible branding links.
- Browser exposed Depot's tagline-only hidden mobile link; corrected and repeated both viewport checks successfully.
- Static fixture uses fallback fonts (the standalone server did not serve the compiled font URL), deliberately omits network/auth/cart behavior and does not claim hydrated Customizer delivery. Build test data never touches a site database.
- Evidence:output/header-branding-20261006/browser-proof.json, desktop.png, render.jsx, index.html, tests.log, types.log, build.log. Screenshot predates the additional tagline-only cases; final JSON covers them.

## Remaining acceptance

Run these controls through the native Customizer against the current Website build, prove immediate preview, Undo/reset, draft save/reopen and published output with original appearance preserved/restored. Do not close full E09 or the delivery goal from this consumer-only evidence. Remaining header layout/navigation/search fields are separate verification work. Existing E82 native promotion proof remains valid; no backend deployment changes in this batch.
