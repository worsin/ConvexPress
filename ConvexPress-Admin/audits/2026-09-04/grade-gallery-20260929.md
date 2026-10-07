# Grade Gallery acceptance — September 29

Grade Gallery's remaining native nested-media, exact recovery and actual Website field/layout checks pass. Evidence is in `output/grade-gallery-20260929/`. Prior canonical-media66 layout and September15 example evidence are reused where unchanged. This closes the last Task2 block row; broader editor and integrated acceptance requirements remain independently open.

## Native authoring and recovery

Real Electron55554 edited heading/intro, nested grade/description/notes and image alt/caption, moved images and sections through ordinary repeater controls, and selected a different existing image through the actual media picker. Three root blocks cover multiple grade studies, an empty list and caption-only/empty media entries. Native document settings changed the page to full width. Saved block revision4 was reopened; after a deliberate title change, history entry5 was independently compared with the full saved tree/title and restored as block revision6 with exact equality. Actual Website mobile preview renders the edited document. Final native console/page errors are empty.

Current canonical fields are `heading`, `intro`, and `sections[{grade,description,notes,images[{mediaId,alt,caption}]}]`. Older tracker shorthand `groups/label` is not the current contract. This ID-backed media field has no per-image focal-point editor; no nonexistent focal control is claimed. Actual images use cover with50%/50% default positioning. Explicit alt overrides and the selected asset's real alternative-text fallback are independently checked.

## E51 — valid image captions overflowed

A valid220-character unbroken caption expanded the1440px published page to2991px. The offending figure/caption was290px wide with2057px of scroll content; the block's columns were already bounded. Applying only `overflow-wrap:anywhere` to the shared image caption returned page width to1440px and removed every measured overflowing grade descendant. The same rule is now in the shared primitive stylesheet, preserving the complete caption. It is a caption layout repair, with no schema, backend, media or authored-content mutation.

Sixteen final cases cover Core, Journal, Depot and Aster House at1440/390, both normal and maximum documents. They verify exact media order/identity, explicit and fallback alternatives, all captions, single-image full width, multi-image columns, image-free copy, no vacant empty tile, caption-only entries, desktop side-by-side/mobile stacked geometry, and no page/descendant overflow. The maximum document uses all12 sections and16 images per section (192 entries) with every textual maximum, including the formerly failing unbroken captions. Reduced motion is enabled for maximum cases. Actual representative images decode; all192 entries and their layout are present. Final public console/page errors are empty. Representative native, desktop and mobile screenshots were visually inspected.

Nine installed malformed writes—every textual/count maximum exceeded separately—are refused without changing the saved document.316 renderer tests/5491 assertions, Website types/build and77-file kit freshness pass. Existing block thumbnail appearance is unchanged. No backend deployment.

## Environment correction

Native preview initially refused its parent. The owned Website runner from the preceding batch had accidentally been started with admin origin `http://localhost:4105`, while the established native origin and prior accepted artifact use `http://127.0.0.1:4105`. The exact origin was restored and the native reconnect rendered successfully. No origin policy was loosened. An attempted observation against the old server after replacing its build returned500; the first new process correctly refused the occupied port. The verified owned old process was then stopped and replaced once. This is recorded as a runner error, not a product authentication defect or backend change.

Cleanup removes both owned pages and their public routes return404. All42 original pages,11 media records and appearance values remain exact; consumer index ready. API revoked, native signed out/closed and owned profile removed. Owner39198/62672/65092/68390 preserved; final owned Website56081 serves4322 with the established exact admin origin. No residual test resources. The one-row tracker receipt must preserve all137 Notes and unrelated cells. Tasks3–8 and E18/E22/E28 remain open. No push or subagents.

Final exact readback:95 Verified/42 In progress/137. Only Grade Gallery Status/Tests/Screenshots changed; every Note and other cell unchanged. All20 rows assigned to Task2 are Verified. Task2 family work is complete within that assigned scope;39 Task3 rows, two migration rows and one SDK row plus wider Tasks4–8 remain.
