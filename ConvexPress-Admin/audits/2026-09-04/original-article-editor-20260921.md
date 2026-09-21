# September 21 original structured article editor

The recovered structured-article editing gap is repaired. This closes that bounded part of B07; B07 and the overall production goal remain open. The original audit remains five accepted and nineteen open.

## Behavior

The post edit route previously forced original structured articles into block mode and converted only their fallback body. Stored hero/topics/summary fields could survive recovery but had no editable controls. Original structured posts now keep article mode and expose their introduction, image/video/button fields, contents, up to five reorderable topics, summary and sources. Retained hero title, fallback body and authoring brief are separately editable. Conversion still uses the existing explicit migration review. Canonical documents retain the existing canonical editor.

The shared save hook previously omitted empty sections, preventing the last topic, summary, image or source text from being cleared. It now sends explicit empty values for changed sections and omits untouched sections. A title-only edit does not rewrite optional structured fields. Empty recovered articles retain their original editor after reopening. The legacy fallback-body statistics are hidden in this structured editor because they do not describe its content.

## Acceptance

One owned draft in Promotion Lab staging (4860), using Core and the actual Electron app, passed:

- Edit introduction, reorder/remove topics, clear summary/sources and remove an image; save, API readback and native reload.
- Select the existing ceramics image through the media picker; add to the five-topic limit, verify movement bounds, remove extra topics, replace summary/sources and save/reopen.
- Explicit conversion into22 canonical blocks; actual Website preview displayed the edited introduction and summary and loaded the same image.
- Native revision confirmation restored the original article.17 stored fields matched the pre-conversion record exactly, including topic order, source text, image identity, fallback, authoring brief and publication/address settings. Hero/topic/summary fields reopened as editable controls.
- Clear all structured sections, including the final topics and authoring brief; readback proved empty objects/array/strings and retained fallback/article mode. Reload kept the article editor; keyboard activation could add another topic.

Native1280×860 screenshot reviewed, with readable labeled fields, reachable save controls, intended vertical scrolling and no document horizontal overflow. Narrow-window native acceptance was not completed: Electron does not expose the attempted Browser.getWindowForTarget CDP method. This is not an all-size editor signoff. One dual-client JavaScript-dialog handling race reset the automation connection; the app stayed live, its saved state was inspected, and the same app was reattached without replaying writes.

## Validation and preservation

Admin web suite:473 passed,0 failed across88 files (the existing hook wrapper includes the new real-hook removal/preservation case). Admin TypeScript and production build pass. New-file lint and whitespace checks pass. The broader changed-file lint run still reports seven existing errors: the older role=main wrapper and six redundant startTransition dependencies; all were confirmed in HEAD. Existing warnings and build chunk-size warnings remain. No backend source or deployment changed.

Cleanup trashed only the owned test article. All42 original pages,2 posts, template/identity snapshot and4 media records were verified. The ceramics attachment introduced by fixture creation was restored; only its legitimate cleanup timestamp differs. The155 previously installed listeners remain. Both owned sessions signed out; owned Electron1107 and Website1141 stopped. Original processes39198/69634/8172/68390 remain.

Evidence: `output/original-article-editor-20260921/` contains `qa-inventory.md`, `edited.json`, `before-conversion.json`, `recovered.json`, `recovery-acceptance.json`, `cleared.json`, `native-acceptance.json`, native screenshots, `admin-web-tests.log`, `admin-types-final.log`, `admin-build.log`, both lint reports, `cleanup.json`, and `native-cleanup.json`.

Canonical body search, rich-text-only legacy editor handling, broader revision/legacy acceptance and legacy retirement remain separate requirements. This compatibility repair does not establish full block/template or release acceptance.
