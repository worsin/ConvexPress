# Text and layout family acceptance — September 21

Heading, Paragraph, Spacer and Divider meet their current canonical block acceptance requirements. This closes four individual block rows, not the other 133 blocks, whole-template acceptance, installed-fleet legacy retirement or production release. The original audit remains eight accepted and sixteen open.

## Product changes

Clearing Heading previously produced an unnamed heading in assistive-technology navigation. Null, empty and whitespace-only text now omit the heading while preserving its explicit link anchor. Authored layout remains intact. A failing-before regression covers all three empty forms.

Native public review also exposed identical sizes for H1–H6. Heading now selects the existing template typography tokens: H1 display, H2 large, H3 medium, H4–H6 small. Semantic levels remain distinct. Packs retain ownership of fonts, colors and size values; other blocks' Heading primitive calls are unchanged. A failing-before renderer regression and four-pack computed-style checks verify the hierarchy. Stored v2 attributes, schema and original revision recovery are unchanged.

BlockDemo has a dedicated text-family study for heading levels, editorial/empty/maximum content, inline marks, tone and alignment. It remains an internal build outside storefront routes.

## Requirement-to-evidence closure

| Block / concern | Evidence |
|---|---|
| Heading content | Current native fixture saved/reopened all six levels and explicit null. Public H1–H6/anchor/null checks at1440/390. Four-pack study covers all levels and 200-character maximum. Shared rich-text mark controls are exercised by Paragraph below. |
| Paragraph content | Current native fixture saves/reopens bold, italic, strike, underline, code, safe new-tab link, hard break and empty paragraph together. Public semantic tags/link attributes verified. Invalid empty link pauses preview/disables save; correction recovers. Four-pack study covers separate marks, keyboard link, empty content and20,000-character body. [Earlier native long/rich-text migration and recovery](paragraph-migration-20260921.md) preserves original structure and3857 edited characters. |
| Layout and anchors | [Native layout acceptance](core-text-layout-20260921.md) covers insertion, save/reopen, width/tone/spacing/alignment, instance/heading anchors, reset/Undo/Redo and invalid anchor retention. Generated tests cover finite choices and unsupported/duplicate values. Current four-pack desktop/mobile checks pass. |
| Spacer and Divider | [Utility acceptance](utility-migration-20260921.md) covers all four original sizes/three variants, real legacy CSS parity, native treatment editing/save/reopen, public rendering under all four packs and exact original recovery. Zero-spacing Spacer has no empty landmark or hidden extra height; Divider remains semantic. |
| Shared editing protections | [Block locks](block-locks-20260921.md) prove saved unlock requirements and backend/native recovery guards. [Audience visibility](block-visibility-20260921.md) proves server filtering with a real Subscriber versus anonymous visitors and authorized editor previews. These shared policies apply to this family's generated contracts; no block-specific data resolver or plugin is required. |
| Design and motion | Current Core/Journal/Depot/Aster House study screenshots at1440/390; earlier native template switching preserves authored trees. Typography, marks, links/focus, divider and spacing inspected. Current public final mobile and Journal desktop images inspected. These static blocks add no animation or raster gradient; no hardware animation claim is made. |

Coverage combines native content/control workflows, all finite generated choices, renderer boundaries and pack visuals. It does not pretend to test every Cartesian combination of layout, content and authority. Broader structured-article conversion, mixed-document capacity and retirement of legacy editors remain separate Phase2 requirements.

## Current verification

- 295 renderer tests/5135 assertions pass; both new regressions fail against the pre-fix code.
- Four browser cases pass across all four packs at1440/390, including existing text/layout and new content/semantics studies. No captured public page errors or horizontal overflow.
- Website and BlockDemo type checks/builds pass. Canonical checks, generated-source freshness, distributed kit parity,548-thumbnail integrity, focused lint and whitespace pass. Existing build chunk-size warnings remain.
- Heading thumbnail metadata refreshed in all four packs; Depot pixels unchanged. Other blocks' thumbnail receipts are preserved.

## Native lifecycle and cleanup

Owned Electron92686 used the current worktree desktop, renderer4105, separate profile and isolated Promotion Lab staging4860. A ten-block original fixture was reviewed/converted, edited, saved and reopened. All six heading levels, explicit null and six inline marks were read back from both native controls and the authorized backend. Native publication exposed the same tree through the production-built Website4322. Final built output has distinct display/large/medium/small heading sizes at both widths, with the empty anchor retained and no unnamed heading.

Native withdrawal and original-editor recovery restored every original authored field. Only blocksRevision, updatedAt and retained publishedAt differ as expected. The fixture is trashed; all42 pre-existing pages and appearance identity/values match baseline. API logout returned200. Native keyboard sign-out was confirmed by the rendered operator sign-in screen and password field. Owned browser, Electron, Website, demo and tunnel processes are closed; the owned profile is removed. Original user processes remain running.

### Separate desktop follow-up

The account dropdown's pointer logout attempt detached its menu item while Playwright waited for stable geometry. Some initial selectors also confused the sidebar and header menus; the header item has the accessible label `Sign out of ConvexPress control plane`. A same-interaction pointer attempt still detached, so this is not dismissed as only a selector mistake. Keyboard Space → End → Enter focused that exact item and signed out. Investigate native pointer/menu stability separately; this receipt does not declare that issue fixed. No native page errors were captured.

## Tracking and artifacts

Standalone MagicTables: fresh master health/base/schema and137-row reads; Status has no configured choices, while the approved block handoff explicitly defines `Verified`. One-row dry-run/probe/readback precedes the remaining three rows. Only the four family rows receive Verified, current source locations/layout/field metadata and appended acceptance notes. Existing Tests/Screenshots remain true. Full137-row readback verifies every other cell unchanged.

Artifacts: `output/core-family-20260921/` contains original/readback/recovery/cleanup receipts, native/public images, four-pack browser screenshots, failing/passing test logs, builds and tracker before/after records. No backend deployment, provider operation, DNS change or push was required for this renderer-only repair.
