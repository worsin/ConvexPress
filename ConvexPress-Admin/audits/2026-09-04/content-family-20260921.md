# Editorial block family acceptance — September 21

List, Definition List, Quote, Pullquote, Callout and Code meet their current canonical block acceptance requirements. Together with the four previously accepted text/layout blocks, this brings the verified inventory to **10/137; 127 remain pending full signoff**. The original production audit remains eight accepted and sixteen open.

## Product repairs

- The generated editor previously rendered unbounded Code text as a single-line input. Native editing silently removed newlines, changing a multiline snippet into one line comment. Unbounded text and existing multiline values now use a textarea. A failing-before DOM regression verifies initial source, editing and committed newlines; actual Electron save/reopen and the published Website retain all six lines.
- Bullet and ordered lists now declare their markers explicitly, overriding the global CSS reset. Task lists retain accessible completed/incomplete icons.
- Quote source URLs now render as usable links. Empty/whitespace quotes and pullquotes omit empty blockquotes. Pullquotes receive a distinct centered, bordered treatment using the active template's typography and colors.
- Long quotation and definition text wraps inside the reading column. Code uses the card's available width and a separately keyboard-scrollable region.
- Code highlighting uses pinned lowlight 3.3.0/highlight.js 11.11.1 with ten explicitly registered grammars and aliases. React renders text/span tokens only. Unknown languages and samples above 20,000 characters remain unchanged literal text; there is no auto-detection. Existing dependencies were not upgraded.

No block schemas, saved versions, backend handlers or deployment contracts changed. Existing source text is preserved; this does not retroactively recover line breaks already removed by an earlier edit.

## Evidence by block

| Block | Current acceptance |
|---|---|
| List | Native task list, rich-text bold mark, done state, item insertion, reorder/Undo, save/reopen and public states. Four packs verify bullet/ordered markers, task states, empty/max text and semantic list elements. |
| Definition List | Native paired terms/rich-text definitions, required-term rejection, reorder/Undo and save/reopen. Public dt/dd pairs and four-pack empty/max wrapping verified. |
| Quote | Native text/citation/source editing; unsafe URL blocks save and correction recovers. Public source destination and keyboard link checked. Empty/null and maximum text verified under four packs. |
| Pullquote | Native text/citation save/reopen and public rendering. Four-pack distinct typography, empty text and maximum length/wrapping checked. |
| Callout | Native title, tip kind and rich-text body save/reopen. Four packs cover all four kinds, named aside, empty/max content and layout. |
| Code | Native language, filename limit/recovery and exact multiline source save/reopen. Public source contains literal script markup without executable script nodes. Four packs verify highlighting, unknown-language fallback, empty/max source and keyboard scrolling. Renderer regressions cover escaped HTML and large-source fallback. |

Shared layout, block protection and audience rules are covered by [layout](core-text-layout-20260921.md), [protection](block-locks-20260921.md) and [visibility](block-visibility-20260921.md) acceptance. These static blocks introduce no animation. This family receipt does not claim every Cartesian field combination, installed-fleet migration retirement, full template surfaces or whole-library quality.

## Verification and design

- 297 renderer cases/5143 assertions pass; the current renderer wrapper suite also passes after the final editor repair.
- Generated form regression reproduced newline loss before the fix. All 12 form DOM cases pass, including submission of all 285 canonical examples; four model cases also pass.
- Two focused browser cases cover Core, Journal, Depot and Aster House at 1440/390px, all states above and no page errors/overflow. Selected desktop/mobile screenshots from every pack and the actual published mobile page were inspected. Code scroll/focus is reset before final specimen captures.
- Thirteen staged migration/planned contract checks pass. Existing migration contracts and original revision storage are unchanged.
- Admin, Website and BlockDemo types/builds pass. Canonical checks, generated-source freshness, eight distributed kit workflows, all 548 thumbnail receipts, focused lint and whitespace checks pass. Existing large-chunk build warnings remain.
- Five affected blocks have refreshed thumbnails under all four packs; every unrelated manifest receipt is unchanged. Callout's renderer is unchanged.

## Native lifecycle and cleanup

Owned Electron5315 used renderer4105 and a separate profile against isolated staging4860. All six blocks were inserted through the catalog and authored using generated controls on page `g1855ab4mt5924thj5g9vm191n8et9e5`. Native save/reopen plus authoritative readback preserved all fields; only the repaired Code source differs from the pre-fix receipt. Native publication rendered through the freshly built Website4322 at desktop/mobile widths.

The fixture was withdrawn and the original empty editor restored (blocksVersion1, empty content and native zero blocks), then trashed. All42 pre-existing pages and complete appearance identity/values match baseline. Native pointer logout after recovery and API logout succeeded. Owned browser, Electron, preview/demo/tunnel processes and profile are removed. Original39198/69634/8172/68390 processes remain running.

One old preview asset import failed while the owned Website build/server was being replaced. Reconnect loaded the new build and final public checks passed; this is retained in native-logout.json rather than reported as a zero-error entire session.

The earlier account-menu pointer detach was not reproduced: a separate fresh-window navigation/recovery/logout exercise and this final post-recovery logout both passed with the exact header menu's accessible label. No menu product fix is claimed. Evidence remains in `output/native-menu-20260921/`; the intermittent report remains available if it recurs.

## Tracking

Standalone MagicTables uses fresh master health/base/schema/137-row reads, a one-row dry-run/probe/readback, then five remaining updates and full-table comparison. Exactly these six existing rows advance to Verified with Tests/Screenshots, current source metadata and appended evidence. All other cells are preserved. Artifacts and before/after receipts: `output/content-family-20260921/`.
