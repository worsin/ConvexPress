# Obsolete native editor retired — October 5, 2026

Task 4/E07 removes the unreachable original article/text editor and v1 composition UI. Thirty-eight files were isolated by the TypeScript-resolved import graph: the old EditorLayout, useEditorForm, exclusive metabox/autosave/shortcut controls, original article/text widgets and their tests, BlockOutline, its panel/library button and PageGenerationPrompt. No current route or outside consumer imports this set.

Canonical editing and deliberate import/recovery remain the route targets. Shared field types, media/SEO/taxonomy components, custom fields, current canonical AI proposal controls and revision recovery are preserved. Only stale comments changed in shared types. The old tests removed with their private modules test the retired editor path; current canonical editor tests remain.

Evidence in `output/legacy-editor-retirement-20261005/`: caller-review.json, composition-caller-review.json, text-references.txt and preserved-source.json record the closure and exact retained files. Existing canonical suite passes **67 tests / 1,147 assertions across 22 wrappers** (including routes, recovery, insertion and AI proposal handling). All four Admin typecheck tasks and the production Admin build pass. The build retains its existing large-chunk advisory. No new test mirrors this deletion; source resolution, existing behavioral tests, typecheck and build verify the boundary.

No backend functions, runtime configuration or site rows changed, and no owned runtime or session was created. Native/Website import proof from wp-canonical-20261005.md remains reusable because those current components are unchanged; this batch does not claim a new native runtime journey. Latest deployment bases remain output/demo-seed-retirement-20261005/{source,target}-source-installed.json.

Ruling: remove the entire proven private editor closure, not just its top-level wrapper, while retaining shared controls and archival conversion code. Cost if wrong: a missed dynamic consumer would require restoring its private module; full source search, TypeScript resolution and build found none. This is retirement work under Task4, not new feature design or full delivery closure.

Next: old blocks read/write/AI endpoints now have no native UI callers. Trace remaining server and installed callers, preserve current canonical AI/composed workflows, then retire that isolated API path. Generic metadata update endpoints and schema/history discriminators remain separately bounded work. E07 stays open; block117/20 and full goal unchanged.
