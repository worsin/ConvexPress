# Gallery accessibility repair

The parent observed three unnamed controls and visible `Alt text:` metadata in the staging gallery lightbox. Source confirmed the shared Website component had no accessible labels on its close/previous/next icon buttons. Its image count was an unexplained fraction, and arrow handling was installed on `window`.

`GalleryLightbox.tsx` now names the controls **Close gallery**, **Previous image**, and **Next image**; announces **Image N of M**; initially focuses Close and restores the opener using the existing Base UI modal; scopes arrow handling to the dialog and ignores modified arrows; and disables navigation when only one image exists. Captions remain visible. Alternative text stays on the image and is no longer printed as implementation metadata below the caption. All template packs use this shared lightbox.

The Admin counterpart, `ImageLightbox.tsx`, already named Close but declared a hand-built modal without focus containment or restoration. It now uses the existing shared Dialog primitive for modal focus, Escape, and backdrop behavior, with explicit close-button initial focus and opener restoration. It preserves the image alternative text and optional caption.

## Verification

Both offline DOM regressions first failed on the observed defect, then passed after repair. They render the real components and Base UI dialog using the already installed JSDOM dependency; Website replaces only its remote MediaImage query with a local image fixture. No browser or provider calls occur. They run in separate processes to keep that module substitution isolated.

- From `ConvexPress-Website/apps/web`: `bun test ../../../output/aster-house/gallery-accessibility.test.ts` — 1 test / 10 assertions pass: named controls, initial focus, alt/caption separation, arrow navigation, count update, Escape and opener restoration.
- From `ConvexPress-Admin/apps/web`: `bun test ../../../output/aster-house/admin-image-accessibility.test.ts` — 1 test / 6 assertions pass: named close, initial focus, image alt/caption, Escape and opener restoration.
- Both frontend `bun run check-types` commands pass. Scoped lint passes for both changed components. `git diff --check` passes for the changes.

The parent owns deployment and rendered browser/AX acceptance. Real browser Tab/Shift+Tab containment and outside-click dismissal should be checked with the deployed build; local DOM assertions do not substitute for that proof.
