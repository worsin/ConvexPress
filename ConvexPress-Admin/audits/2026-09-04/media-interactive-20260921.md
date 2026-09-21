# Interactive media acceptance — September 21

Video, Audio, Lightbox Grid and Before / after pass their current canonical contract acceptance. The block count advances from 26 to **30/137 verified; 107 pending** after tracker readback. Embed remains In progress: actual YouTube playback passed, while Vimeo playback remains unverified. The original production audit remains eight accepted and sixteen open.

## Code repairs

Before / after used a physical left divider and left clip regardless of writing direction. Both new narrow/wide browser regressions failed before the repair: a 25% RTL input placed the divider at 25% from the left rather than 75%. The renderer now supplies one comparison-position CSS variable; logical positioning and direction-specific clipping keep the image reveal, labels and native range value consistent. Saved attributes and schema versions are unchanged.

The actual Electron media picker exposed seven non-image icon buttons without accessible names. It now shows each item's title (with filename fallback), gives every item an accessible selection name and pressed state, and preserves visible keyboard focus. Keyboard selection of uploaded audio/video succeeded. Thumbnail space remains bounded above a truncated visible label. Search also has an accessible label. No backend code or deployment changed in this batch.

## Authored and published behavior

An owned Electron process used renderer 4105, an isolated profile and Promotion Lab staging database 4860. Its five-block page was `media-interactive-20260921`.

- Before / after: selected two distinct existing images and authored alternative text and comparison labels. Actual published Home, End and arrow keys produced 0, 100 and 25 with corresponding accessible percentages.
- Lightbox Grid: selected two existing images and independent captions. Published keyboard opening, next/previous, Escape and trigger-focus restoration passed. Mobile modal controls and the full image remained available.
- Audio: uploaded the explicitly synthetic one-second silent WAV through the native picker; authored its title and transcript link. Actual audio time advanced, with no media error; pause and the transcript destination passed.
- Video: uploaded the synthetic four-second WEBM, selected an existing poster, and authored a title and transcript destination. Playback and pause passed. Adding a direct URL while media was selected correctly disabled Save with the mutually exclusive source error. Unsetting media and authoring a direct HTTPS video then passed actual playback, including mobile.
- Embed: authored and published YouTube, then Vimeo. No provider request occurred before consent. The YouTube player actually played; unload removed the frame and restored focus. Vimeo sample 76979871 displayed a rights-authorization error. Its separate standalone player remained at zero seconds with metadata but no advancing playback. This does not isolate the cause or establish Vimeo success; no sandbox restriction was relaxed.

Saved and reopened the five-block document in Electron, then published it through the reviewed publication control. Transcript links opened a supporting page with actual text. The first supporting fixture incorrectly supplied raw HTML to the structured-content API; correcting the fixture to TipTap JSON produced its body. This setup error is not counted as a product repair.

## Checks and visual review

Seven browser cases pass: two comparison direction cases across four packs at 390/1440, two audio/video playback cases across the same packs/widths, and three existing gallery layout cases at 390/844/1440. The latter exercises both Gallery and Lightbox Grid, including long captions. The 297 renderer cases pass (5,143 assertions). Admin, Website and demo types, Website production build, canonical contracts/freshness, all 77 kit files and focused Oxlint pass. Whitespace checks pass.

Reviewed the native picker, actual published mobile comparison/lightbox/audio, Depot desktop video and Journal desktop audio captures. Synthetic checkerboard and silent media are explicitly test fixtures. Shared schema controls, layout/locks/audience/recovery and unchanged prior all-example coverage are reused; this batch is not a new whole-app GPU or continuous-animation acceptance claim. The full Website lint still has the previously recorded downloads control-character-regex warning. An accidental ESLint invocation failed before analyzing files; the repository's pinned Oxlint command was subsequently used and passed.

## Preservation and tracking

Withdrew the page, restored its original editor version, and signed out through the native menu. Permanently removed only the two owned pages and their revisions, then the two owned uploaded media records without forcing referenced-media deletion. Exact comparisons prove the 42 pre-existing pages, 11 media records, and appearance identity/values unchanged. API logout returned 200. The owned Electron/browser, servers, tunnel and profile were cleaned up; the user's original Electron, renderer, BlockDemo and SOCKS processes remain running.

Artifacts are in `output/media-interactive-20260921/`: failing-before/final browser logs, native reopen and picker evidence, playback/transcript/provider receipts, reviewed captures, checks and cleanup comparisons. MagicTables updates four existing acceptance rows and one Embed Notes cell, with a dry run and complete 137-row readback comparison. No new inventory row, provider account, live payment or production domain was created.

Remaining: Vimeo provider playback; full template/Library release gates; the original 16 audit requirements. Continue another finite block family without repeating the unchanged shared acceptance cases.
