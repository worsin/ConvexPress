# Video Hero — September 21

**Video Hero is verified for its current canonical contract. 58/137 blocks verified;79 In progress. Original production audit remains eight accepted/sixteen open.**

## Requirement and repair

The specification describes a looping full-bleed video cover with overlaid copy. The prior renderer instead displayed a normal native player beneath its heading. The repaired SDK treatment fills the available cover with video and places authored copy in a solid, token-colored panel. The narrow treatment leaves a substantial visible image above the inset copy panel; it does not crush the video into two thin strips. No gradients or per-frame JavaScript animation were added.

Cover playback is muted and looping, with an explicit keyboard-accessible Play/Pause control. It starts only when visible with no reduced-motion preference. Offscreen or hidden documents pause it. A reduced-motion change stops it; explicit visitor playback remains available. Autoplay-policy rejection leaves an operable Play button. Errors retain the poster and copy and expose Retry. Each video source owns a separate playback lifecycle; stale promises cannot resume a paused or replaced element. Observers/listeners are removed on unmount.

This is a decorative video cover. The ordinary Video primitive/block remains a native player with captions, sound controls and no autoplay; the Hero AI guidance now directs speech/instructional clips there. Cover captions and distinct resolved poster/video identities remain supported. The Hero title is H1; optional invisible-only title/subtitle do not create an empty heading/panel. Existing saved strings are not rewritten. Subtitle selects a multiline editor without changing its string type, defaults or schema version. No content migration is required.

## Verification

-305 renderer cases/5,370 assertions pass. The cover SSR test checks paused initial markup, custom control, muted looping, distinct video/poster, focal point, captions, action and MIME refusal. A deferred-play DOM regression verifies reduced-motion interruption, source replacement, explicit playback and listener/observer cleanup.
-Four browser cases pass. New coverage exercises all four packs,1200/350px geometry, overlaid heading, actual video playback, manual pause, normal-motion startup, offscreen pause/resume, live reduced-motion changes, keyboard play and recoverable video-request failure. Existing media-details cases still pass lightbox/marquee/countdown behavior at1440/390px. The old cover-native-controls assertion was replaced with the new explicit control contract; normal Video tests remain unchanged.
-Admin, Website and BlockDemo types, final client/SSR build, generated freshness, block/kit checks, focused lint and diff whitespace pass. Four Hero Video thumbnails were refreshed; all548 catalog entries validate.

Owned Electron3574 used the synthetic operator on isolated staging4860. The native media picker uploaded hero-video-cover-fixture.webm, selected the existing ceramics poster, and authored title, multiline subtitle, per-use alt text, anchor and CTA. Save/reopen, a changed title and reviewed history restore passed. Authorized revision readback proves revision3, restored revision5 and published revision7 contain exactly the same block tree.

The actual built Website at1440/390px started paused in reduced-motion mode, played after explicit activation, stayed muted, crossed a real loop boundary, paused on command, and allowed keyboard navigation from the playback button to the CTA. Poster decoding and no horizontal overflow were confirmed. Final rebuilt Website playback was rechecked. The four-second silent synthetic clip tests lifecycle and looping; it does not certify every customer codec or broad hardware/GPU performance.

## Deployment and cleanup

Strict deployment succeeded in50.7seconds from ConvexPress-Admin/output/production-checkpoints/hero-video-20260921, preserving1601 files and22 installed Events files. Future snapshots must derive from this checkpoint. Only generated field/editor/catalog metadata changed server-side; the subsequent renderer/CSS refinements did not alter backend contracts.

Native withdrawal, original-editor recovery and sign-out passed. The owned page and uploaded media record/storage were permanently removed. All42 original pages,11 original media and appearance values compare unchanged; nine Events/media tables match the pre-deployment backup. The removed page renders404. Owned API/browser/Electron/preview/tunnel resources closed and private profile removed. User processes39198/69634/8172/68390 remain running.

Harness corrections: the fixture file was under block-demo/public rather than Website public; a broad H1 locator matched the page title as well as the Hero; the first2.6second sample was shorter than the4second video, so an explicit near-end playback sample subsequently proved the loop. These did not remove checks or conceal a failed playback result.

MagicTables updates only core/hero-video completion fields and appends this evidence, with an exact dry-run and full137-row readback. Artifacts: output/hero-video-20260921, including browser-final.log, renderers-final.log, native-recovery.json, recovery-proof.json, public-proof.json, owned-media.json, final-preservation.json, cleanup.json and public-cleanup.json.

Next: remaining opening/navigation and other unfinished block families; complete template websites and all original audit release gates remain open.
