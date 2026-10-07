# Header branding controls — 2026-10-06

Task 5 / E09 / E83. Branding repair accepted through actual component/browser checks and native four-pack publication. Full Task5 field matrix remains open.

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

## Native completion follow-up

Used the existing isolated Acceptance.app with a new private profile and the existing synthetic operator, normal control-plane login and staging authority. Served the current production Website build on4322 against disposable source4860. Source appearance, general/reading settings, menu assignments and43pages were captured before any mutation; API fixture setup only added a local test logo URL. No backend deployment was needed.

Actual native actions and observed outcomes:

- Core: changed Medium to Large, hid title, enabled tagline; header immediately showed the image and tagline. Branding-off removed the entire brand; Undo restored it. Image-off produced the tagline-only link; Undo restored the image. Header Reset returned Medium/title-on/tagline-off; Undo/Redo and final Undo restored the chosen three settings.
- Saved the Core draft; the accepted appearance snapshot stayed exactly unchanged. Reloaded the actual native window, saw the saved-draft offer and default published preview, loaded the draft and observed Large/title-off/tagline-on restored. Reviewed the sole changed path header.logo and published. Native UI reported Everything published and cleared its saved-draft offer.
- Used native Templates activation and native Customize controls for each remaining pack. Journal published Small/title-off/tagline-on. Depot published image-off/title-off/tagline-on. Aster House published Large/title-off/tagline-on. All reported Everything published.
- Actual Website at1440px and335px (8checks): Core logo40px plus tagline; Journal logo20px with separate homepage tagline; Depot visible tagline-only home link including mobile; Aster logo36px with homepage tagline. Images loaded and no horizontal header overflow. Real Website assets/fonts were served, unlike the earlier standalone CSS fixture.
- API readback matched the exact expected four-pack values: only active-pack selection and the four header.logo groups changed; all other appearance fields,43pages,menu assignments and reading settings remained equal to baseline. The test logo was the only general-setting change.

Restoration published the exact original appearance values (Core active) with expected revision, cleared the test logo and verified preservation again. General settings are semantically identical; the formerly absent logoUrl key is now the canonical empty string, and normal settings revision/audit metadata advanced. No media records were created. Restored the operator's original Live scope, signed out in the native UI, revoked the owned API session (refresh401), removed the private profile/local fixture file, stopped owned native47102 and Website47141, and verified7protected processes remained alive.

Evidence in output/header-branding-20261006: before-publish.json, native-published-snapshot.json, four-pack-published-snapshot.json, native-public-proof.json, native-core-disabled.txt, native-{core-large,core-published,journal-published,depot-published,aster-published}.png, restoration.json and cleanup.json. Baseline snapshots remain private. Native draft/history/reset lifecycle was exercised on Core through the shared Customizer; it was not repeated separately on every pack. Four-pack publication and resulting real Website rendering were each exercised directly.

E83 is closed within this branding boundary. Full E09, remaining header layout/navigation/search/menu fields, hosted E05 and the overall delivery goal remain open. Existing E82 promotion evidence remains valid.
