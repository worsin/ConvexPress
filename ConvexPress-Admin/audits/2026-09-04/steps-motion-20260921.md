# Steps with Media image delivery — September 21

**The blank image-loading stage is repaired. Full Steps with Media acceptance remains open; 52/137 blocks verified, 85 In progress. Original production audit: eight accepted, sixteen open.**

The pinned stage now retains the current step number/title until its image decodes successfully. Failed media retains that copy with an Image unavailable message. The image fades into the same fixed frame without layout shift. Decode completion is bound to the exact media source and effect lifetime, preventing late promises from marking a replacement or removed source ready. The duplicate stage remains hidden from assistive technology; semantic inline images and their authored alternative text remain in reading order. No saved-content schema, migration or backend deployment changes.

## Evidence and limits

The delayed-image browser regression failed before the fix. Final process-family browser suite passes seven cases; the renderer suite passes 303 tests/5,250 assertions, including source replacement, decode rejection and removal during pending work. Website/demo types, client/SSR build, generated freshness, block checks, kit parity and focused lint pass. Existing unchanged native authoring/recovery/publication evidence from process-family-20260921 is reused.

The current built Website published an owned page on isolated source4860 using the original site media. A held image request kept the current Test the pattern title visible. Releasing it yielded a decoded image with a 576px stage/image height and unchanged stage geometry. An aborted request retained the correct title and error message after the previous image finished fading out. At390px, the ordinary inline sequence and both original image/alt values loaded without horizontal overflow. Selected loading/error/mobile screenshots were inspected; the initial loading/error captures were mid-crossfade, so public-error-settled.png additionally proves the settled frame excludes the preceding image. The first error assertion ran after a reload without restoring the reading position; scrolling back to the second step corrected that test setup.

The preserved historical304.5ms frame is still unexplained. A traced first transition and three fresh contexts with network cache disabled each sampled100 frames, worst8.6–8.7ms and no observed long tasks. Trace inspection found worker decode work, but no evidence connecting it to the prior outlier. Cold samples revealed unloaded stage images and led to the reproducible repair above. Three additional activation probes also stayed below9ms, but document.hasFocus remained true; these do not establish a focus-change control or explain the old sample. Do not count this repair or the subsequent samples as a complete hardware-motion pass.

## Preservation and tracking

Owned page withdrawn and permanently removed; actual public URL returns HTTP404 with rendered404 heading. All42 original pages and appearance identity/values compare unchanged. The owned API session is logged out; owned browser, Website preview and tunnel are closed. No original media or installed-plugin source/data was modified. Existing user processes are preserved.

MagicTables receives one Notes-only update, with exact dry-run comparison and full137-row readback. Status/Tests/Screenshots remain unchanged. Evidence resides in output/steps-motion-20260921: loading-before.log, loading-after.log, browser-all.log, renderers.log, types.log, demo-types-final.log, build.log, first-trace.json, first-sample.json, cold-cache-samples.json, activation-samples.json, public-acceptance.json, public-error-settled.png, cleanup.json and public-cleanup.json.

Next: continue the remaining block families; retain this bounded motion follow-up for the broader template/site hardware review instead of repeatedly sampling the same unreproduced historical frame. The overall production goal remains active.
