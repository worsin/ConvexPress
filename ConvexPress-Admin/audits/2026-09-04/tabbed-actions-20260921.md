# Tabbed Content authoring acceptance — September 21

**Tabbed Content is verified for its current canonical contract. Total: 15/137 verified, 122 pending.** This closes the explicit CTA defect retained by the disclosure-family review. The original production audit remains eight accepted and sixteen open; the full production goal stays active.

## Change and compatibility

The block now declares its action destination/label relationship in `authoringActions`. The compiler checks that the rule addresses declared sibling fields inside an object or repeater. The generated authoring validator and scoped custom-definition adapter apply the same safe-link policy used by the renderer and require a nonblank action label when a destination exists. Empty destinations still support a text-only label.

Stored shape and version2 are unchanged. Reading old values, original-editor recovery, settings changes, withdrawal and explicit draft revision recovery remain available. New initialize/save/preview requests reject invalid actions; publication, scheduled publication, promotion and non-draft revision recovery also enforce them. Reusable content creation/save and publication review enforce the rule independently of the page editor. No stored values are silently rewritten. A recovered invalid draft must be corrected before publication.

Two new regressions failed before implementation: the native editor model and canonical save preparation both accepted `javascript:alert(1)`. Passing regression coverage now includes exact issue paths, unchanged invalid draft text, valid links, whitespace labels, declared-path/type checks, nested objects, scoped composed definitions, server refusal without post/history mutation, old-value repair, draft recovery and reusable-content refusal/repair.

## Native and deployed evidence

Owned Electron48202 used its own profile with renderer4105 and isolated staging4860. Fixture `g18defx3m2qyhzqv88myksdqq58ev7rr` was created empty, initialized through Use block editor, and populated through the real block catalog.

- Invalid destination remains in its input, exposes the `tabs · 0 · ctaUrl` safe-link diagnostic, disables Save and pauses preview.
- A valid destination with a whitespace-only label exposes the label diagnostic and disables Save. Correcting the label restores saving.
- Saved destination, label and exact multiline body survive native reload. A second text-only action is preserved.
- Four direct deployed API attempts (bad URL and blank label, each through save and preview) are refused with the saved document unchanged.
- Native publication renders the actual built Website. At1440/390px, hydrated tabs pass Home/End selection, text-only panel behavior and page-width bounds. The CTA navigates to the existing Fieldwork page and renders its actual H1. Both final screenshots were inspected.
- The initial keyboard attempt ran against server-rendered content before hydration and did not select the panel. The completed checks wait for network settlement and verify actual selected state; this is not presented as proof of pre-hydration event replay.
- Native withdrawal and original-editor recovery restore the empty legacy editor. Native pointer logout succeeds, with zero captured native page errors.

The previous disclosure-family review supplies four-pack visual, maximum/empty-content, LTR/RTL keyboard, real-media/alt and native lifecycle evidence for this same block. Renderers, primitives, pack styles, stored field shapes and examples are unchanged by this repair. That evidence is reused explicitly, rather than claiming a new four-pack screenshot run. See [disclosure-family-20260921.md](disclosure-family-20260921.md).

## Verification

135 focused checks across compiler, editor model, document state, registered document/custom handlers and reusable content pass. The final broad backend run passes3463 tests; the complete renderer harness passes297 cases/5143 assertions. Generated form DOM and composed-editor wrappers pass. Backend, Admin and Website types, both app builds, canonical contracts/freshness, kit distribution,548 thumbnails, focused lint and whitespace checks pass. Existing build chunk-size warnings remain.

The broad backend run initially exposed two obsolete assertions from earlier accepted work: rejection of now-supported signed-in/out audiences and Paragraph's old2k limit. Updated tests verify audience preservation for the separate authorized display projection, refusal of unknown audiences, exact20k paragraph preservation and20,001-character refusal. No corresponding production behavior was changed to satisfy these tests.

## Deployment incident and recovery

The first deployment snapshot incorrectly overlaid the entire backend and omitted the staging installation's Community Events reference plugin. The push removed that plugin's handlers and indexes. The preserved plugin source was restored to the deployment snapshot, extension indexes regenerated, writer coverage checked, and the repaired snapshot deployed with strict typechecking. The repair push deleted no indexes. The plugin remains disabled according to its existing settings; its handler again returns the expected `PLUGIN_DISABLED` policy denial.

A pre-deployment export included file storage. A fresh post-repair export proves all107 post records,6 settings records and11 media records unchanged. Every record across the plugin's six tables is unchanged, including its event,3 RSVP entries and6 operation records. No database import or data rollback was needed. The normal resumable reusable-consumer index rebuild reached ready after checking222 documents.

Future staging checkpoints must preserve installed extension directories and regenerate their schema/plugin/search/dashboard/RSVP indexes. Do not replace an installed backend with the generic source tree. The repaired checkpoint is `ConvexPress-Admin/output/production-checkpoints/tabbed-actions-20260921`; its source manifest explicitly records the preserved plugin and hashes.

## Cleanup and tracking

Fixture recovered then trashed; all42 pre-existing non-trash pages and appearance identity/values match baseline. API logout200, native logout, owned profile removal and owned Electron/Website/tunnel/browser exits are verified. Original39198/69634/8172/68390 processes remain running.

Exactly the existing Tabbed Content row advances to Verified with Tests/Screenshots and appended evidence after fresh standalone MagicTables reads and a dry run. Full137-row readback matches the one-row plan; all other cells are unchanged. Artifacts, logs and receipts: `output/tabbed-actions-20260921/`.

All remaining122 blocks, full template/kit/motion acceptance, installed-fleet migration retirement and the16 original open production requirements remain open.
